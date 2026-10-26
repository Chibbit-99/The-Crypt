/**
 * The Crypt — Google Classroom resource exporter
 *
 * Serves index.html as an Apps Script web app, lists the user's classes,
 * and exports the selected class's downloadable Drive attachments to a ZIP.
 * ZIP bytes are returned to the browser as base64 so the browser can download
 * the archive onto the user's actual device. No GitHub upload is performed.
 */

const CONFIG = {
  PAGE_SIZE: 100,
  MAX_ZIP_SOURCE_BYTES: 32 * 1024 * 1024,
  INCLUDE_COURSEWORK: true,
  INCLUDE_CLASS_MATERIALS: true,
  INCLUDE_ANNOUNCEMENTS: true
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('The Crypt — Classroom Exporter')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Load all courses for the class picker. Called when the page opens. */
function getClassroomCourses() {
  assertClassroomService_();
  return listAllCourses_().map(function(course) {
    return {
      id: String(course.id),
      name: course.name || '(untitled class)',
      section: course.section || '',
      courseState: course.courseState || '',
      alternateLink: course.alternateLink || ''
    };
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });
}

/**
 * Export one class's downloadable Drive attachments to a ZIP.
 * The returned base64 is converted into a Blob by index.html and downloaded
 * by the browser. External links and unsupported Google file types are listed
 * in EXPORT-REPORT.txt instead of being falsely treated as downloaded files.
 */
function exportClassResources(courseId) {
  assertClassroomService_();
  if (!courseId) throw new Error('Select a class first.');

  const courses = listAllCourses_();
  const course = courses.filter(function(c) { return String(c.id) === String(courseId); })[0];
  if (!course) throw new Error('That class was not found in the account running this app.');

  const courseInfo = {
    id: String(course.id),
    name: course.name || '(untitled class)'
  };
  const resources = [];
  const warnings = [];

  function collect(stage, getter) {
    try {
      getter(course.id).forEach(function(item) {
        addMaterialResources_(
          { resources: resources },
          courseInfo,
          stage,
          item,
          item.materials || []
        );
      });
    } catch (error) {
      warnings.push(stage + ' scan failed: ' + errorMessage_(error));
    }
  }

  if (CONFIG.INCLUDE_COURSEWORK) collect('assignment', listCoursework_);
  if (CONFIG.INCLUDE_CLASS_MATERIALS) collect('class material', listCourseMaterials_);
  if (CONFIG.INCLUDE_ANNOUNCEMENTS) collect('announcement', listAnnouncements_);

  const unique = deduplicateResources_(resources).filter(function(r) {
    return r.kind === 'drive_file' && r.driveFileId;
  });

  const blobs = [];
  const report = [
    'The Crypt — Classroom export report',
    'Class: ' + courseInfo.name,
    'Generated: ' + new Date().toISOString(),
    '',
    'Only downloadable Drive attachments are included in this ZIP.',
    'Links, YouTube videos, Forms, unsupported Google file types and files that',
    'could not be accessed are reported below.',
    ''
  ];
  let sourceBytes = 0;
  let exportedCount = 0;
  let skippedCount = 0;

  unique.forEach(function(resource) {
    try {
      const file = DriveApp.getFileById(resource.driveFileId);
      const mimeType = file.getMimeType();
      const converted = getExportBlob_(file, mimeType);
      if (!converted) {
        skippedCount++;
        report.push('SKIPPED (unsupported type): ' + file.getName() + ' [' + mimeType + ']');
        return;
      }

      const bytes = converted.blob.getBytes().length;
      if (sourceBytes + bytes > CONFIG.MAX_ZIP_SOURCE_BYTES) {
        skippedCount++;
        report.push('SKIPPED (ZIP size safety limit): ' + file.getName() +
          ' (' + formatBytes_(bytes) + ')');
        return;
      }

      const stagePrefix = resource.source && resource.source.type
        ? resource.source.type.replace(/[^a-z0-9_-]/gi, '_') + ' - '
        : '';
      const baseName = safeFilename_(stagePrefix + (converted.baseName || file.getName()));
      const uniqueName = makeUniqueName_(baseName, blobs);
      converted.blob.setName(uniqueName);
      blobs.push(converted.blob);
      sourceBytes += bytes;
      exportedCount++;
      report.push('EXPORTED: ' + uniqueName + ' (' + formatBytes_(bytes) + ')');
    } catch (error) {
      skippedCount++;
      report.push('SKIPPED (could not access/export): ' + (resource.title || resource.driveFileId) +
        ' — ' + errorMessage_(error));
    }
  });

  resources.forEach(function(resource) {
    if (resource.kind !== 'drive_file') {
      report.push('REFERENCE ONLY: ' + (resource.title || resource.kind) +
        (resource.url ? ' — ' + resource.url : ''));
    }
  });

  if (warnings.length) {
    report.push('', 'SCAN WARNINGS:', warnings.join('\n'));
  }

  report.push(
    '',
    'Summary:',
    'Exported files: ' + exportedCount,
    'Skipped files: ' + skippedCount,
    'Source bytes included: ' + formatBytes_(sourceBytes),
    'Scan warnings: ' + warnings.length
  );

  const reportBlob = Utilities.newBlob(report.join('\n'), 'text/plain', 'EXPORT-REPORT.txt');
  blobs.push(reportBlob);

  const zipName = safeFilename_(courseInfo.name) + '-resources.zip';
  const zipBlob = Utilities.zip(blobs, zipName);
  const zipBytes = zipBlob.getBytes();

  // Base64 adds roughly one third to the payload. Keep the ZIP below a
  // conservative limit so google.script.run can return it reliably.
  if (zipBytes.length > 35 * 1024 * 1024) {
    throw new Error('The ZIP is too large to send safely to your browser. Try exporting a smaller class or split the export into smaller groups.');
  }

  return {
    success: true,
    filename: zipName,
    mimeType: 'application/zip',
    base64: Utilities.base64Encode(zipBytes),
    exportedCount: exportedCount,
    skippedCount: skippedCount,
    referenceCount: resources.filter(function(r) { return r.kind !== 'drive_file'; }).length,
    warningCount: warnings.length,
    zipBytes: zipBytes.length
  };
}

/** Convert native Google documents to common local formats; download other files as-is. */
function getExportBlob_(file, mimeType) {
  const googleExports = {
    'application/vnd.google-apps.document': {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: '.docx'
    },
    'application/vnd.google-apps.spreadsheet': {
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: '.xlsx'
    },
    'application/vnd.google-apps.presentation': {
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ext: '.pptx'
    },
    'application/vnd.google-apps.drawing': {
      mime: 'application/pdf',
      ext: '.pdf'
    }
  };

  if (googleExports[mimeType]) {
    const target = googleExports[mimeType];
    const url = 'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(file.getId()) + '/export?mimeType=' + encodeURIComponent(target.mime);
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Google Drive export returned HTTP ' + code +
        '. The file may be too large or export may be restricted.');
    }
    const name = stripExtension_(file.getName()) + target.ext;
    return { blob: response.getBlob().setName(name), baseName: name };
  }

  // These Drive-native types do not have a useful direct download/export in
  // this workflow. Do not silently substitute a misleading file format.
  if (mimeType && mimeType.indexOf('application/vnd.google-apps.') === 0) {
    return null;
  }

  const blob = file.getBlob();
  blob.setName(file.getName() || 'download');
  return { blob: blob, baseName: file.getName() || 'download' };
}

function assertClassroomService_() {
  if (typeof Classroom === 'undefined' || !Classroom.Courses || !Classroom.Courses.list) {
    throw new Error('Google Classroom API service is missing. In Apps Script, open Services (+) and add "Google Classroom API".');
  }
}

function listAllCourses_() {
  const output = [];
  let pageToken;
  do {
    const options = { pageSize: CONFIG.PAGE_SIZE };
    if (pageToken) options.pageToken = pageToken;
    const response = Classroom.Courses.list(options);
    (response.courses || []).forEach(function(course) { output.push(course); });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return output;
}

function listCoursework_(courseId) {
  return listPaged_(function(options) {
    return Classroom.Courses.CourseWork.list(courseId, options);
  }, 'courseWork');
}

function listCourseMaterials_(courseId) {
  return listPaged_(function(options) {
    return Classroom.Courses.CourseWorkMaterials.list(courseId, options);
  }, 'courseWorkMaterial');
}

function listAnnouncements_(courseId) {
  return listPaged_(function(options) {
    return Classroom.Courses.Announcements.list(courseId, options);
  }, 'announcements');
}

function listPaged_(request, collectionKey) {
  const output = [];
  let pageToken;
  do {
    const options = { pageSize: CONFIG.PAGE_SIZE };
    if (pageToken) options.pageToken = pageToken;
    const response = request(options);
    (response[collectionKey] || []).forEach(function(item) { output.push(item); });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return output;
}

function addMaterialResources_(manifest, course, sourceType, item, materials) {
  const source = {
    type: sourceType,
    id: item.id == null ? '' : String(item.id),
    title: item.title || item.name || '(untitled)',
    topicId: item.topicId == null ? '' : String(item.topicId),
    topicName: '',
    alternateLink: item.alternateLink || '',
    creationTime: item.creationTime || '',
    updateTime: item.updateTime || '',
    dueDate: item.dueDate || null,
    dueTime: item.dueTime || null
  };

  materials.forEach(function(material, index) {
    if (material.driveFile && material.driveFile.driveFile) {
      const drive = material.driveFile.driveFile;
      manifest.resources.push({
        kind: 'drive_file', courseId: course.id, courseName: course.name,
        source: source, attachmentIndex: index,
        title: drive.title || '(untitled Drive file)',
        driveFileId: drive.id ? String(drive.id) : '',
        mimeType: drive.mimeType || '',
        url: drive.alternateLink || '',
        status: drive.id ? 'discovered' : 'missing_file_id'
      });
    } else if (material.link && material.link.url) {
      manifest.resources.push({
        kind: 'external_link', courseId: course.id, courseName: course.name,
        source: source, attachmentIndex: index,
        title: material.link.title || material.link.url,
        url: material.link.url, status: 'reference_only'
      });
    } else if (material.youtubeVideo) {
      manifest.resources.push({
        kind: 'youtube_video', courseId: course.id, courseName: course.name,
        source: source, attachmentIndex: index,
        title: material.youtubeVideo.title || '(YouTube video)',
        url: material.youtubeVideo.alternateLink || '', status: 'reference_only'
      });
    } else if (material.form) {
      manifest.resources.push({
        kind: 'google_form', courseId: course.id, courseName: course.name,
        source: source, attachmentIndex: index,
        title: material.form.title || '(Google Form)',
        url: material.form.formUrl || '', status: 'reference_only'
      });
    } else {
      manifest.resources.push({
        kind: 'unknown_attachment', courseId: course.id, courseName: course.name,
        source: source, attachmentIndex: index, status: 'unrecognised_attachment_type'
      });
    }
  });
}

function deduplicateResources_(resources) {
  const seen = {};
  const output = [];
  resources.forEach(function(resource) {
    const key = resource.kind === 'drive_file' && resource.driveFileId
      ? 'drive:' + resource.driveFileId
      : resource.kind + ':' + (resource.url || '') + ':' +
        resource.courseId + ':' + (resource.source.id || '') + ':' + resource.attachmentIndex;
    if (!seen[key]) {
      seen[key] = resource;
      resource.sources = [resource.source];
      output.push(resource);
    } else if (resource.source) {
      seen[key].sources.push(resource.source);
    }
  });
  return output;
}

function safeFilename_(name) {
  return String(name || 'classroom-export')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .substring(0, 120) || 'classroom-export';
}

function stripExtension_(name) {
  return String(name || 'export').replace(/\.[^/.]+$/, '');
}

function makeUniqueName_(name, blobs) {
  const existing = {};
  blobs.forEach(function(blob) { existing[blob.getName()] = true; });
  if (!existing[name]) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.substring(0, dot) : name;
  const ext = dot > 0 ? name.substring(dot) : '';
  let n = 2;
  while (existing[stem + ' (' + n + ')' + ext]) n++;
  return stem + ' (' + n + ')' + ext;
}

function formatBytes_(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function errorMessage_(error) {
  return String(error && error.message ? error.message : error);
}
