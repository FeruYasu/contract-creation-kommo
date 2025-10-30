/**
 * Google Docs and Drive Operations
 *
 * Handles document creation, placeholder replacement, and file management
 */

const { google } = require('googleapis');

class GoogleDocsClient {
  constructor() {
    // Initialize Google API credentials from environment variables
    const credentials = this.parseCredentials();

    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });

    this.docs = google.docs({ version: 'v1', auth: this.auth });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  /**
   * Parse Google credentials from environment variable
   * @returns {Object} Parsed credentials object
   */
  parseCredentials() {
    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!credsJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY must be set in environment variables');
    }

    try {
      return JSON.parse(credsJson);
    } catch (error) {
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON format');
    }
  }

  /**
   * Create a copy of the template document
   * Template must be in a Shared Drive to avoid service account quota issues
   * @param {string} templateId - Template document ID (must be in Shared Drive)
   * @param {string} newTitle - Title for the new document
   * @param {string} folderId - Optional folder ID to create copy in (must be in Shared Drive)
   * @returns {Promise<string>} New document ID
   */
  async copyTemplate(templateId, newTitle, folderId = null) {
    try {
      console.log('Copying template from Shared Drive...');

      const requestBody = {
        name: newTitle,
      };

      // If folder ID provided, place copy in that folder
      if (folderId) {
        requestBody.parents = [folderId];
      }

      // Copy the file with Shared Drive support
      const response = await this.drive.files.copy({
        fileId: templateId,
        requestBody,
        supportsAllDrives: true,
        fields: 'id',
      });

      const newDocId = response.data.id;
      console.log('Document copied successfully in Shared Drive:', newDocId);

      return newDocId;
    } catch (error) {
      console.error('Error copying template:', error.message);
      console.error('Make sure template document is in a Shared Drive, not My Drive');
      throw error;
    }
  }

  /**
   * Replace placeholders in a document
   * @param {string} documentId - Document ID
   * @param {Object} replacements - Key-value pairs of placeholders and their values
   * @returns {Promise<void>}
   */
  async replacePlaceholders(documentId, replacements) {
    try {
      // Build requests for batch update
      const requests = [];

      for (const [placeholder, value] of Object.entries(replacements)) {
        // Skip if value is null or undefined
        if (value === null || value === undefined) {
          console.warn(`Skipping placeholder ${placeholder} - no value provided`);
          continue;
        }

        requests.push({
          replaceAllText: {
            containsText: {
              text: placeholder,
              matchCase: true,
            },
            replaceText: String(value), // Ensure value is a string
          },
        });
      }

      if (requests.length === 0) {
        console.warn('No valid replacements to make');
        return;
      }

      // Execute batch update
      await this.docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests,
        },
      });

      console.log(`Replaced ${requests.length} placeholders in document ${documentId}`);
    } catch (error) {
      console.error('Error replacing placeholders:', error.message);
      throw error;
    }
  }

  /**
   * Move document to a specific folder
   * @param {string} fileId - Document ID
   * @param {string} folderId - Destination folder ID
   * @returns {Promise<void>}
   */
  async moveToFolder(fileId, folderId) {
    try {
      // Get current parents
      const file = await this.drive.files.get({
        fileId,
        fields: 'parents',
        supportsAllDrives: true,
      });

      const previousParents = file.data.parents ? file.data.parents.join(',') : '';

      // Move to new folder
      await this.drive.files.update({
        fileId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
        supportsAllDrives: true,
      });

      console.log(`Moved document ${fileId} to folder ${folderId}`);
    } catch (error) {
      console.error('Error moving document to folder:', error.message);
      throw error;
    }
  }

  /**
   * Share document with users
   * @param {string} fileId - Document ID
   * @param {Array<string>} emails - Email addresses to share with
   * @param {string} role - Permission role ('reader', 'writer', 'commenter')
   * @returns {Promise<void>}
   */
  async shareDocument(fileId, emails, role = 'reader') {
    try {
      const validRoles = ['reader', 'writer', 'commenter'];
      if (!validRoles.includes(role)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
      }

      for (const email of emails) {
        await this.drive.permissions.create({
          fileId,
          requestBody: {
            type: 'user',
            role,
            emailAddress: email.trim(),
          },
          sendNotificationEmail: true,
          supportsAllDrives: true,
        });

        console.log(`Shared document ${fileId} with ${email} as ${role}`);
      }
    } catch (error) {
      console.error('Error sharing document:', error.message);
      throw error;
    }
  }

  /**
   * Get shareable link for document
   * @param {string} fileId - Document ID
   * @returns {Promise<string>} Shareable link
   */
  async getShareableLink(fileId) {
    try {
      // Make file accessible via link (anyone with link can view)
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          type: 'anyone',
          role: 'reader',
        },
        supportsAllDrives: true,
      });

      // Get file metadata with webViewLink
      const file = await this.drive.files.get({
        fileId,
        fields: 'webViewLink',
        supportsAllDrives: true,
      });

      return file.data.webViewLink;
    } catch (error) {
      console.error('Error getting shareable link:', error.message);
      throw error;
    }
  }

  /**
   * Create contract document from template with replacements
   * @param {string} templateId - Template document ID
   * @param {string} title - New document title
   * @param {Object} replacements - Placeholder replacements
   * @param {string} folderId - Optional folder ID to move document to
   * @param {Array<string>} shareWith - Optional email addresses to share with
   * @param {string} shareRole - Share permission role
   * @returns {Promise<Object>} Document info { id, link }
   */
  async createContract(templateId, title, replacements, folderId = null, shareWith = [], shareRole = 'reader') {
    try {
      // Step 1: Copy template directly into destination folder
      // This avoids service account storage quota issues
      console.log('Creating document from template...');
      const newDocId = await this.copyTemplate(templateId, title, folderId);

      // Step 2: Replace placeholders
      console.log('Replacing placeholders...');
      await this.replacePlaceholders(newDocId, replacements);

      // Note: File already created in destination folder, no need to move

      // Step 3: Share with users if specified
      if (shareWith && shareWith.length > 0) {
        console.log('Sharing document...');
        await this.shareDocument(newDocId, shareWith, shareRole);
      }

      // Step 4: Get shareable link
      console.log('Getting shareable link...');
      const link = await this.getShareableLink(newDocId);

      return {
        id: newDocId,
        link,
      };
    } catch (error) {
      console.error('Error creating contract:', error.message);
      throw error;
    }
  }
}

module.exports = GoogleDocsClient;
