# Classroom discovery Apps Script

This folder contains the first-stage Google Classroom exporter for The Crypt.

## What it does

- classroom-discovery.gs discovers resources visible to the signed-in account from coursework/assignments, class materials and announcements.
- index.html is the web app dashboard. It calls the server-side Apps Script function using google.script.run, displays discovery counts and links to the manifest.
- The script records Drive attachment IDs and links, and notes external links, YouTube videos and Forms as references. It writes a timestamped JSON manifest to Google Drive.

**This is discovery only.** It does not download attachment contents, upload files to GitHub, read student submissions, or bypass Drive permissions.

## Set up the Apps Script web app

1. Open [Google Apps Script](https://script.google.com/) and create a standalone project.
2. Add a script file named classroom-discovery.gs (or use the default Code.gs) and copy in the contents of the repository's classroom-discovery.gs.
3. In the editor, click **Services +** and add **Google Classroom API**.
4. Click **+** beside Files and choose **HTML**. Name the file exactly **index** (Apps Script will show it as index.html) and paste in the contents of this repository's index.html.
5. Save the project.
6. Select doGet and click **Deploy → New deployment**.
7. Select the gear icon and choose **Web app**.
8. For a personal tool, set **Execute as** to **Me** and **Who has access** to **Only myself**. Do not make a school-resource exporter public.
9. Click **Deploy**, complete any authorisation prompts, then open the web app URL. If prompted, authorise the app with the school account.
10. Click **Run discovery** on the dashboard. When it finishes, click **Open manifest**.

When changing the code later, use **Deploy → Manage deployments → Edit** and select a new version, then redeploy for the existing web app URL to serve the update.

## Important hosting distinction

The HTML dashboard is a Google Apps Script HTML Service page, not a standalone GitHub Pages app. The google.script.run bridge only exists when index.html is served by Apps Script. Hosting this HTML on GitHub Pages will not run the server-side .gs functions.

No separately managed Google Cloud project should normally be necessary. If the school administrator has disabled Classroom API access or Apps Script, contact them rather than attempting to bypass the restriction.

## Output

The JSON manifest contains course metadata, unique Drive file IDs, source-post metadata, external-link references, counts and any API errors. Re-run discovery to generate a fresh manifest.

## Known limitations

- Only resources the account running the script is allowed to discover are returned.
- Drive files can be listed by Classroom but still be unavailable for download.
- Linked web pages are recorded as URLs; their contents are not archived.
- Google Docs, Sheets and Slides are not exported in this stage.
- The manifest may contain school/course names and Drive file IDs. Keep it private and do not share it publicly without checking school rules.
