/**
 * The Crypt — Google Classroom resource discovery
 *
 * Discovers Drive attachments visible to the signed-in student in:
 *   - coursework / assignments
 *   - class materials
 *   - announcements
 *
 * This script does NOT download files or upload anything to GitHub yet.
 * It creates a JSON manifest in the user's Google Drive and logs its URL.
 *
 * Setup:
 * 1. Create a standalone project at https://script.google.com/
 * 2. In Services (+), add "Google Classroom API" (advanced service).
 * 3. Run discoverClassroomResources() and approve the requested access.
 * 4. Inspect the generated manifest in Google Drive.
 *
 * Uses the default Apps Script Cloud project; no separately managed project
 * should be needed unless your Workspace administrator requires one.
 */

const CONFIG = {
  PAGE_SIZE: 100,
  OUTPUT_PREFIX: 'classroom-discovery-',
  INCLUDE_COURSEWORK: true,
  INCLUDE_CLASS_MATERIALS: true,
  INCLUDE_ANNOUNCEMENTS: true
};

/**
 * Main entry point. Run this function from the Apps Script editor.
 */
function discoverClassroomResources() {
  assertClassroomService_();

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    account: safeEffectiveUser_(),
    scope: 'Visible Classroom Drive attachments only; no student submissions',
    courses: [],
    resources: [],
    warnings: [],
    stats: {}
  };

  const courses = listAllCourses_();
  manifest.courses = courses.map(function(course) {
    return {
      id: String(course.id),
      name: course.name || '(untitled course)',
      section: course.section || '',
      courseState: course.courseState || '',
      alternateLink: course.alternateLink || ''
    };
  });

  courses.forEach(function(course) {
    const courseInfo = {
      id: String(course.id),
      name: course.name || '(untitled course)'
    };

    if (CONFIG.INCLUDE_COURSEWORK) {
      try {
        listCoursework_(course.id).forEach(function(item) {
          addMaterialResources_(
            manifest,
            courseInfo,
            'coursework',
            item,
            item.materials || []
          );
        });
      } catch (error) {
        manifest.warnings.push(warning_('coursework', courseInfo, error));
      }
    }

    if (CONFIG.INCLUDE_CLASS_MATERIALS) {
      try {
        listCourseMaterials_(course.id).forEach(function(item) {
          addMaterialResources_(
            manifest,
            courseInfo,
            'class_material',
            item,
            item.materials || []
          );
        });
      } catch (error) {
        manifest.warnings.push(warning_('class_material', courseInfo, error));
      }
    }

    if (CONFIG.INCLUDE_ANNOUNCEMENTS) {
      try {
        listAnnouncements_(course.id).forEach(function(item) {
          addMaterialResources_(
            manifest,
            courseInfo,
            'announcement',
            item,
            item.materials || []
          );
        });
      } catch (error) {
        manifest.warnings.push(warning_('announcement', courseInfo, error));
      }
    }
  });

  manifest.resources = deduplicateResources_(manifest.resources);
  manifest.stats = buildStats_(manifest);

  const filename = CONFIG.OUTPUT_PREFIX +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
    '.json';
  const file = DriveApp.createFile(
    filename,
    JSON.stringify(manifest, null, 2),
    MimeType.PLAIN_TEXT
  );

  Logger.log('Discovery finished.');
  Logger.log('Courses: ' + manifest.stats.courseCount);
  Logger.log('Unique Drive attachments: ' + manifest.stats.driveAttachmentCount);
  Logger.log('External links: ' + manifest.stats.externalLinkCount);
  Logger.log('Warnings: ' + manifest.stats.warningCount);
  Logger.log('Manifest: ' + file.getUrl());

  return {
    manifestUrl: file.getUrl(),
    stats: manifest.stats
  };
}

/** Checks that the advanced Classroom service has been enabled. */
function assertClassroomService_() {
  if (typeof Classroom === 'undefined' ||
      !Classroom.Courses ||
      !Classroom.Courses.list) {
    throw new Error(
      'Google Classroom API service is missing. In Apps Script, open Services (+) ' +
      'and add "Google Classroom API", then run this function again.'
    );
  }
}

function listAllCourses_() {
  const output = [];
  let pageToken;
  do {
    const options = { pageSize: CONFIG.PAGE_SIZE };
    if (pageToken) options.pageToken = pageToken;
    const response = Classroom.Courses.list(options);
    (response.courses || []).forEach(function(course) {
      output.push(course);
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return output;
}

function listCoursework_(courseId) {
  return listPaged_(
    function(options) {
      return Classroom.Courses.CourseWork.list(courseId, options);
    },
    'courseWork'
  );
}

function listCourseMaterials_(courseId) {
  return listPaged_(
    function(options) {
      return Classroom.Courses.CourseWorkMaterials.list(courseId, options);
    },
    'courseWorkMaterial'
  );
}

function listAnnouncements_(courseId) {
  return listPaged_(
    function(options) {
      return Classroom.Courses.Announcements.list(courseId, options);
    },
    'announcements'
  );
}

function listPaged_(request, collectionKey) {
  const output = [];
  let pageToken;
  do {
    const options = { pageSize: CONFIG.PAGE_SIZE };
    if (pageToken) options.pageToken = pageToken;
    const response = request(options);
    (response[collectionKey] || []).forEach(function(item) {
      output.push(item);
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return output;
}

/**
 * Extracts Drive attachments and records external links as references only.
 * Google Forms and YouTube attachments are recorded as non-downloadable links.
 */
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
        kind: 'drive_file',
        courseId: course.id,
        courseName: course.name,
        source: source,
        attachmentIndex: index,
        title: drive.title || '(untitled Drive file)',
        driveFileId: drive.id ? String(drive.id) : '',
        mimeType: drive.mimeType || '',
        url: drive.alternateLink || '',
        status: drive.id ? 'discovered' : 'missing_file_id'
      });
      return;
    }

    if (material.link && material.link.url) {
      manifest.resources.push({
        kind: 'external_link',
        courseId: course.id,
        courseName: course.name,
        source: source,
        attachmentIndex: index,
        title: material.link.title || material.link.url,
        url: material.link.url,
        status: 'reference_only'
      });
      return;
    }

    if (material.youtubeVideo) {
      manifest.resources.push({
        kind: 'youtube_video',
        courseId: course.id,
        courseName: course.name,
        source: source,
        attachmentIndex: index,
        title: material.youtubeVideo.title || '(YouTube video)',
        url: material.youtubeVideo.alternateLink || '',
        status: 'reference_only'
      });
      return;
    }

    if (material.form) {
      manifest.resources.push({
        kind: 'google_form',
        courseId: course.id,
        courseName: course.name,
        source: source,
        attachmentIndex: index,
        title: material.form.title || '(Google Form)',
        url: material.form.formUrl || '',
        status: 'reference_only'
      });
      return;
    }

    manifest.resources.push({
      kind: 'unknown_attachment',
      courseId: course.id,
      courseName: course.name,
      source: source,
      attachmentIndex: index,
      status: 'unrecognised_attachment_type'
    });
  });
}

function deduplicateResources_(resources) {
  const seen = {};
  const output = [];

  resources.forEach(function(resource) {
    // Deduplicate the same Drive file attached to multiple Classroom posts.
    // Keep each source reference so none of the context is lost.
    const key = resource.kind === 'drive_file' && resource.driveFileId
      ? 'drive:' + resource.driveFileId
      : resource.kind + ':' + (resource.url || '') + ':' +
        resource.courseId + ':' + (resource.source.id || '') + ':' +
        resource.attachmentIndex;

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

function buildStats_(manifest) {
  const stats = {
    courseCount: manifest.courses.length,
    resourceCount: manifest.resources.length,
    driveAttachmentCount: 0,
    externalLinkCount: 0,
    youtubeCount: 0,
    formCount: 0,
    unknownAttachmentCount: 0,
    warningCount: manifest.warnings.length
  };

  manifest.resources.forEach(function(resource) {
    if (resource.kind === 'drive_file') stats.driveAttachmentCount++;
    else if (resource.kind === 'external_link') stats.externalLinkCount++;
    else if (resource.kind === 'youtube_video') stats.youtubeCount++;
    else if (resource.kind === 'google_form') stats.formCount++;
    else stats.unknownAttachmentCount++;
  });

  return stats;
}

function warning_(stage, course, error) {
  return {
    stage: stage,
    courseId: course.id,
    courseName: course.name,
    message: String(error && error.message ? error.message : error)
  };
}

function safeEffectiveUser_() {
  // Email may be blank due to Workspace privacy settings; do not fail discovery.
  try {
    return Session.getEffectiveUser().getEmail() || '';
  } catch (error) {
    return '';
  }
}
