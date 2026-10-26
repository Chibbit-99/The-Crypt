# Classroom discovery Apps Script

This folder contains the first-stage Google Classroom exporter for The Crypt.

## What it does

`classroom-discovery.gs` discovers resources visible to the signed-in student from:

- Coursework / assignments
- Class materials
- Announcements

It records Drive attachment IDs and links, and notes external links, YouTube videos and Forms as references. It writes a timestamped JSON manifest to the signed-in user's Google Drive.

**This is discovery only.** It does not download attachment contents, upload files to GitHub, read student submissions, or bypass Drive permissions.

## Setup

1. Open [Google Apps Script](https://script.google.com/) and create a standalone project.
2. In the editor, click **Services +** and add **Google Classroom API**.
3. Copy the contents of `classroom-discovery.gs` into the Apps Script editor (the `.gs` extension is supported).
4. Save, select `discoverClassroomResources`, and click **Run**.
5. Review the requested permissions and authorise with the school account, if your Workspace administrator allows them.
6. Open **Execution log** and follow the manifest URL.

No separately managed Google Cloud project should normally be necessary. If the school administrator has disabled Classroom API access or Apps Script, contact them rather than attempting to bypass the restriction.

## Output

The JSON manifest contains course metadata, unique Drive file IDs, source-post metadata, external-link references, counts and any API errors. Re-run the function to generate a fresh manifest.

## Known limitations

- Only resources the signed-in account is allowed to discover are returned.
- Drive files can be listed by Classroom but still be unavailable for download.
- Linked web pages are recorded as URLs; their contents are not archived.
- Google Docs, Sheets and Slides are not exported in this stage.
- This script intentionally does not upload anything to GitHub yet; discovery should be tested before the download/upload stage is added.
- The manifest may contain school/course names and Drive file IDs. Keep it in a private repository and do not share it publicly without checking school rules.
