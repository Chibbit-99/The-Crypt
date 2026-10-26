# Classroom ZIP exporter (Apps Script)

This folder contains The Crypt's Google Classroom class exporter.

## What it does

- When the web app opens, it loads the classes available to the signed-in account.
- You choose one class and click **Export selected class**.
- The server scans that class's assignments/coursework, class materials and announcements.
- Downloadable Drive attachments are bundled into a ZIP. The page converts the returned ZIP bytes into a browser download, saving it to the user's actual device.
- Google Docs, Sheets and Slides are exported as DOCX, XLSX and PPTX; Google Drawings are exported as PDFs. Other downloadable Drive files are included as-is.
- Drive IDs are deduplicated, and the ZIP includes EXPORT-REPORT.txt showing exported files, skipped files, reference-only links and scan warnings.

**No GitHub upload is performed.** External URLs, YouTube videos and Google Forms are references, not downloadable files in this workflow. Unsupported native Google file types, files the account cannot access, and files excluded by the size safety limit are noted in the report.

## Set up the Apps Script web app

1. Open [Google Apps Script](https://script.google.com/) and create a standalone project.
2. Add a script file named classroom-discovery.gs (or use the default Code.gs) and paste in the contents of this repository's classroom-discovery.gs.
3. In the editor, click **Services +** and add **Google Classroom API**.
4. Click **+** beside Files and choose **HTML**. Name the file exactly **index** (Apps Script displays it as index.html) and paste in the contents of this repository's index.html.
5. Save the project.
6. Select doGet and click **Deploy → New deployment**.
7. Choose **Web app** from the deployment type menu.
8. For a personal tool, set **Execute as** to **Me** and **Who has access** to **Only myself**. Do not make a school-resource exporter public.
9. Click **Deploy**, complete authorisation prompts, then open the web app URL.
10. The page should load your classes automatically. Choose a class and click **Export selected class**.

When changing the code later, use **Deploy → Manage deployments → Edit**, select a new version, and redeploy for the existing web app URL to serve the update.

## Hosting and permissions

The HTML dashboard is served by Apps Script HTML Service. The google.script.run bridge works only when Apps Script serves index.html; GitHub Pages alone cannot run the server-side .gs functions.

The script uses the Google Classroom advanced service, DriveApp to read attachments, and UrlFetchApp with the current Apps Script OAuth token to export Google-native documents. Apps Script may ask for Classroom, Drive and external-request permissions. No separately managed Cloud project should normally be necessary, but a Workspace administrator can restrict these APIs or Apps Script.

## Size and format limits

- The ZIP transfer is deliberately limited to a conservative size (roughly 32 MB of source file data, with a hard check on the final ZIP response). Large classes may need to be split into smaller exports.
- Apps Script runtime, Google Drive export limits, account permissions and Workspace administrator policies still apply.
- Only files visible to the account running the web app can be exported.
- Google Sites, Forms, videos and external web pages are not archived as complete resources; they are recorded in EXPORT-REPORT.txt when encountered.
- Keep the downloaded ZIP private if it contains school materials.
