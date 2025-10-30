# Contract Creation from Kommo CRM

Automatically create and fill Google Docs contracts when leads move to a specific status in Kommo CRM.

## Features

- **Automatic Trigger**: Webhook fires when lead moves to configured pipeline/status
- **Template Cloning**: Creates new document from Google Docs template
- **Placeholder Replacement**: Replaces `[Nome Completo]`, `[RG]`, `[CPF]`, `[Endereço]` with lead data
- **Document Management**:
  - Stores in specific Google Drive folder
  - Shares with team members automatically
  - Gets shareable link
- **Kommo Integration**: Posts document link back as note in lead
- **Serverless**: Deploys to Vercel with no server management

## Project Structure

```
/api
  /webhook.js          - Main webhook handler
  /list-fields.js      - Helper endpoint for field discovery
/lib
  /kommo.js            - Kommo API client
  /google-docs.js      - Google Docs/Drive operations
/config
  /field-mapping.js    - Maps custom field IDs to placeholders
  /settings.js         - Application settings
.env.example           - Environment variables template
package.json
vercel.json
README.md
```

## Setup Guide

### 1. Google Cloud Setup

#### Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your project ID

#### Enable Required APIs

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search and enable:
   - **Google Docs API**
   - **Google Drive API**

#### Create Service Account

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **Service Account**
3. Name it (e.g., "kommo-contract-automation")
4. Grant role: **Editor** (or more restrictive custom role)
5. Click **Done**

#### Generate Service Account Key

1. Click on the created service account
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Download the JSON file (keep it secure!)

#### Share Template Document

1. Open your Google Docs template
2. Click **Share**
3. Add the service account email (found in JSON: `client_email`)
4. Grant **Editor** permission

#### Share Target Folder (Optional)

If you want documents stored in a specific folder:

1. Open the target Google Drive folder
2. Click **Share**
3. Add the service account email
4. Grant **Editor** permission

### 2. Kommo Setup

#### Get Access Token

1. Log in to your Kommo account
2. Go to **Settings** > **API**
3. Create or copy your **Access Token**
4. Note your Kommo domain (e.g., `https://yourcompany.kommo.com`)

#### Find Custom Field IDs (Already configured)

The field IDs are already set in `config/field-mapping.js`:

- `764177` → `[Nome Completo]`
- `3333` → `[RG]`
- `44444` → `[CPF]`
- `5555` → `[Endereço]`

If you need to discover other field IDs, use the helper endpoint after deployment:

```
GET https://your-vercel-url.vercel.app/api/list-fields?lead_id=YOUR_LEAD_ID
```

### 3. Prepare Google Docs Template

1. Create a Google Doc with your contract template
2. Add placeholders exactly as configured:
   - `[Nome Completo]` - Will be replaced with full name
   - `[RG]` - Will be replaced with RG number
   - `[CPF]` - Will be replaced with CPF number
   - `[Endereço]` - Will be replaced with address

3. Get the document ID from the URL:
   - URL: `https://docs.google.com/document/d/1abc123xyz/edit`
   - ID: `1abc123xyz`

4. Make sure the service account has access (see step 1)

### 4. Local Development Setup

#### Install Dependencies

```bash
npm install
```

#### Configure Environment Variables

1. Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

2. Edit `.env.local` and fill in all values:

```env
KOMMO_DOMAIN=https://yourcompany.kommo.com
KOMMO_ACCESS_TOKEN=your_access_token

GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...entire JSON from downloaded file...}
GOOGLE_TEMPLATE_DOC_ID=your_template_doc_id

# Optional
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
GOOGLE_SHARE_WITH=email1@example.com,email2@example.com
GOOGLE_SHARE_ROLE=reader

KOMMO_TRIGGER_PIPELINE_ID=123456
KOMMO_TRIGGER_STATUS_ID=789012
```

#### Test Locally

```bash
npm run dev
```

This starts a local development server. You can test with:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"leads":{"status":[{"id":123456,"status_id":789012}]}}'
```

### 5. Deploy to Vercel

#### Install Vercel CLI (if not installed)

```bash
npm install -g vercel
```

#### Login to Vercel

```bash
vercel login
```

#### Deploy

```bash
vercel --prod
```

#### Configure Environment Variables in Vercel

After deployment:

1. Go to your project in [Vercel Dashboard](https://vercel.com/dashboard)
2. Go to **Settings** > **Environment Variables**
3. Add all variables from `.env.local`:
   - `KOMMO_DOMAIN`
   - `KOMMO_ACCESS_TOKEN`
   - `GOOGLE_SERVICE_ACCOUNT_KEY`
   - `GOOGLE_TEMPLATE_DOC_ID`
   - `GOOGLE_DRIVE_FOLDER_ID` (optional)
   - `GOOGLE_SHARE_WITH` (optional)
   - `GOOGLE_SHARE_ROLE` (optional)
   - `KOMMO_TRIGGER_PIPELINE_ID` (optional)
   - `KOMMO_TRIGGER_STATUS_ID` (optional)

4. Redeploy for changes to take effect

### 6. Configure Kommo Webhook

1. Log in to Kommo
2. Go to **Settings** > **Webhooks**
3. Click **Add Webhook**
4. Configure:
   - **URL**: `https://your-vercel-url.vercel.app/api/webhook`
   - **Event**: Select **Lead Status Changed**
   - **Method**: POST
5. Save

### 7. Testing

#### Test with Real Lead

1. In Kommo, move a lead to the configured status
2. Check Vercel logs for processing:
   ```bash
   vercel logs
   ```
3. Verify document was created in Google Drive
4. Verify link was posted back to Kommo lead

#### Debug Field Discovery

If field values aren't populating correctly:

```bash
curl https://your-vercel-url.vercel.app/api/list-fields?lead_id=YOUR_LEAD_ID
```

This shows all custom fields and their IDs for debugging.

## Configuration

### Field Mapping

Edit `config/field-mapping.js` to customize field mappings:

```javascript
module.exports = {
  '764177': '[Nome Completo]',
  '3333': '[RG]',
  '44444': '[CPF]',
  '5555': '[Endereço]',
  // Add more mappings as needed
};
```

### Trigger Conditions

Edit `config/settings.js` or set environment variables:

- `KOMMO_TRIGGER_PIPELINE_ID`: Only trigger for specific pipeline
- `KOMMO_TRIGGER_STATUS_ID`: Only trigger for specific status

Leave empty to trigger on all status changes.

### Document Sharing

Configure in environment variables:

- `GOOGLE_SHARE_WITH`: Comma-separated emails
- `GOOGLE_SHARE_ROLE`: `reader`, `writer`, or `commenter`

### Kommo Note Template

Customize the note posted to Kommo in `.env`:

```env
KOMMO_NOTE_TEMPLATE=📄 Contrato criado: {link}
```

## API Endpoints

### POST /api/webhook

Main webhook handler. Receives Kommo webhooks.

**Called by**: Kommo automatically

**Response**:
```json
{
  "success": true,
  "leadId": 123456,
  "documentId": "1abc123xyz",
  "documentLink": "https://docs.google.com/document/d/1abc123xyz/edit"
}
```

### GET /api/list-fields

Helper endpoint to discover custom field IDs.

**Usage**: `GET /api/list-fields?lead_id=123456`

**Response**:
```json
{
  "lead": {
    "id": 123456,
    "name": "Lead Name",
    "status_id": 789,
    "pipeline_id": 456
  },
  "customFieldsInLead": [
    {
      "id": 764177,
      "name": "Nome Completo",
      "value": "João Silva"
    }
  ]
}
```

## Troubleshooting

### Webhook not triggering

- Check Vercel logs: `vercel logs`
- Verify webhook URL in Kommo settings
- Ensure webhook event is "Lead Status Changed"
- Check trigger conditions in `config/settings.js`

### Fields not populating

- Use `/api/list-fields?lead_id=XXX` to verify field IDs
- Check `config/field-mapping.js` matches actual field IDs
- Ensure fields have values in Kommo lead

### Google API errors

- Verify service account has access to template document
- Check service account has access to target folder
- Ensure Google Docs API and Drive API are enabled
- Verify `GOOGLE_SERVICE_ACCOUNT_KEY` is valid JSON

### Kommo API errors

- Verify `KOMMO_ACCESS_TOKEN` is valid
- Check `KOMMO_DOMAIN` format (include https://)
- Ensure API access is enabled in Kommo settings

## Security Notes

- **Never commit `.env.local`** - it's already in `.gitignore`
- Store environment variables securely in Vercel
- Restrict service account permissions to minimum required
- Keep Google service account JSON key secure
- Rotate access tokens regularly

## License

MIT
