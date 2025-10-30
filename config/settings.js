/**
 * Application Settings
 *
 * Configure trigger conditions, Google Drive settings, and sharing options
 */

module.exports = {
  // Kommo Pipeline and Status Configuration
  // When a lead moves to this pipeline/status, the webhook will trigger
  trigger: {
    // Leave empty to trigger on any pipeline, or specify pipeline ID
    pipelineId: process.env.KOMMO_TRIGGER_PIPELINE_ID || null,

    // Leave empty to trigger on any status, or specify status ID
    // To find status IDs, use the /api/list-fields helper endpoint
    statusId: process.env.KOMMO_TRIGGER_STATUS_ID || null,
  },

  // Google Drive Configuration
  googleDrive: {
    // ID of the template Google Doc to clone
    // Extract from URL: https://docs.google.com/document/d/TEMPLATE_ID_HERE/edit
    templateDocId: process.env.GOOGLE_TEMPLATE_DOC_ID,

    // ID of the folder where created documents should be stored
    // Extract from URL: https://drive.google.com/drive/folders/FOLDER_ID_HERE
    // Leave empty to create in root folder
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,

    // Email addresses to share the document with (comma-separated)
    // Example: "user1@example.com,user2@example.com"
    shareWith: process.env.GOOGLE_SHARE_WITH
      ? process.env.GOOGLE_SHARE_WITH.split(',').map(email => email.trim())
      : [],

    // Permission role for shared users: 'reader', 'writer', or 'commenter'
    shareRole: process.env.GOOGLE_SHARE_ROLE || 'reader',
  },

  // Kommo Integration Settings
  kommo: {
    // Whether to post the document link back to the lead as a note
    postLinkToLead: process.env.KOMMO_POST_LINK === 'true' || true,

    // Note text template (use {link} placeholder)
    noteTemplate: process.env.KOMMO_NOTE_TEMPLATE || 'Contrato criado: {link}',
  },
};
