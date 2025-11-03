/**
 * Autentique API Integration
 *
 * Handles document creation and signature requests via Autentique API
 */

const axios = require('axios');
const FormData = require('form-data');
const { google } = require('googleapis');

class AutentiqueClient {
  constructor() {
    this.apiKey = process.env.AUTENTIQUE_API_KEY;
    this.apiUrl = 'https://api.autentique.com.br/v2/graphql';
    this.sandbox = process.env.AUTENTIQUE_SANDBOX === 'true';

    if (!this.apiKey) {
      throw new Error('AUTENTIQUE_API_KEY must be set in environment variables');
    }

    // Initialize Google Drive client for PDF export
    this.initializeGoogleDrive();
  }

  /**
   * Initialize Google Drive API client
   */
  initializeGoogleDrive() {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      this.drive = google.drive({ version: 'v3', auth });
    } catch (error) {
      console.error('Error initializing Google Drive:', error.message);
      throw error;
    }
  }

  /**
   * Export Google Doc as PDF
   * @param {string} documentId - Google Docs document ID
   * @returns {Promise<Buffer>} PDF file buffer
   */
  async exportDocumentAsPdf(documentId) {
    try {
      console.log(`Exporting document ${documentId} as PDF...`);

      const response = await this.drive.files.export({
        fileId: documentId,
        mimeType: 'application/pdf',
        supportsAllDrives: true,
      }, {
        responseType: 'arraybuffer',
      });

      console.log('Document exported as PDF successfully');
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error exporting document as PDF:', error.message);
      throw error;
    }
  }

  /**
   * Create GraphQL mutation for document creation
   * @param {string} documentName - Name of the document
   * @param {Array<Object>} signers - Array of signer objects with email and action
   * @returns {Object} GraphQL query and variables
   */
  buildCreateDocumentMutation(documentName, signers) {
    const mutation = `
      mutation CreateDocument(
        $document: DocumentInput!,
        $signers: [SignerInput!]!,
        $file: Upload!,
        $sandbox: Boolean
      ) {
        createDocument(
          sandbox: $sandbox,
          document: $document,
          signers: $signers,
          file: $file
        ) {
          id
          name
          created_at
          signatures {
            public_id
            email
            created_at
            action {
              name
            }
            user {
              name
              email
            }
          }
        }
      }
    `;

    const variables = {
      document: {
        name: documentName,
      },
      signers: signers.map(signer => ({
        email: signer.email,
        action: signer.action || 'SIGN',
      })),
      sandbox: this.sandbox,
    };

    return { mutation, variables };
  }

  /**
   * Create document on Autentique with signers
   * @param {string} documentName - Name of the document
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {Array<Object>} signers - Array of signers: [{ name, email, action }]
   * @returns {Promise<Object>} Document creation response
   */
  async createDocument(documentName, pdfBuffer, signers) {
    try {
      console.log(`Creating document on Autentique: ${documentName}`);
      console.log(`Sandbox mode: ${this.sandbox}`);
      console.log(`Signers: ${signers.map(s => s.email).join(', ')}`);

      // Build GraphQL mutation
      const { mutation, variables } = this.buildCreateDocumentMutation(documentName, signers);

      // Create form data for multipart request
      const form = new FormData();

      // Add GraphQL operations
      const operations = {
        query: mutation,
        variables,
      };
      form.append('operations', JSON.stringify(operations));

      // Add file mapping (GraphQL multipart request spec)
      const map = {
        '0': ['variables.file'],
      };
      form.append('map', JSON.stringify(map));

      // Add the PDF file
      form.append('0', pdfBuffer, {
        filename: `${documentName}.pdf`,
        contentType: 'application/pdf',
      });

      // Make request to Autentique API
      const response = await axios.post(this.apiUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      // Check for GraphQL errors
      if (response.data.errors) {
        console.error('GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
        throw new Error(`Autentique API error: ${response.data.errors[0].message}`);
      }

      const document = response.data.data.createDocument;
      console.log(`Document created successfully on Autentique: ${document.id}`);
      console.log(`Autentique link: https://painel.autentique.com.br/documentos/${document.id}`);

      return document;
    } catch (error) {
      console.error('Error creating document on Autentique:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Send contract to Autentique for signature
   * High-level method that exports Google Doc and creates Autentique document
   *
   * @param {string} googleDocId - Google Docs document ID
   * @param {string} documentName - Name for the Autentique document
   * @param {string} leadContactEmail - Lead/client email address
   * @param {string} leadContactName - Lead/client name (optional, for logging)
   * @returns {Promise<Object>} Autentique document info with signature links
   */
  async sendContractForSignature(googleDocId, documentName, leadContactEmail, leadContactName = null) {
    try {
      // Step 1: Export Google Doc as PDF
      const pdfBuffer = await this.exportDocumentAsPdf(googleDocId);

      // Step 2: Prepare signers array
      const signers = [];

      // Add company representative as first signer
      const companyName = process.env.AUTENTIQUE_COMPANY_SIGNER_NAME;
      const companyEmail = process.env.AUTENTIQUE_COMPANY_SIGNER_EMAIL;

      if (!companyEmail) {
        throw new Error('AUTENTIQUE_COMPANY_SIGNER_EMAIL must be set in environment variables');
      }

      signers.push({
        name: companyName || 'Company Representative',
        email: companyEmail,
        action: 'SIGN',
      });

      // Add lead contact as second signer
      if (!leadContactEmail) {
        throw new Error('Lead contact email is required');
      }

      signers.push({
        name: leadContactName || 'Client',
        email: leadContactEmail,
        action: 'SIGN',
      });

      // Step 3: Create document on Autentique
      const document = await this.createDocument(documentName, pdfBuffer, signers);

      // Step 4: Return document info with links
      const autentiqueLink = `https://painel.autentique.com.br/documentos/${document.id}`;

      return {
        id: document.id,
        name: document.name,
        createdAt: document.created_at,
        signatures: document.signatures.map(sig => ({
          publicId: sig.public_id,
          email: sig.email,
          name: sig.user?.name || sig.email,
          action: sig.action.name,
        })),
        // Use constructed Autentique panel link
        primaryLink: autentiqueLink,
      };
    } catch (error) {
      console.error('Error sending contract for signature:', error.message);
      throw error;
    }
  }
}

module.exports = AutentiqueClient;
