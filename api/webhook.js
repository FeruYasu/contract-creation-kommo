/**
 * Kommo Webhook Handler
 *
 * Receives webhooks from Kommo when leads change status
 * Creates and fills Google Docs contracts automatically
 */

const KommoClient = require('../lib/kommo');
const GoogleDocsClient = require('../lib/google-docs');
const AutentiqueClient = require('../lib/autentique');
const fieldMapping = require('../config/field-mapping');
const settings = require('../config/settings');

/**
 * Main webhook handler
 */
module.exports = async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received webhook from Kommo');
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    // Extract lead data from webhook
    const webhookData = req.body;

    // Kommo sends different webhook structures, handle the most common
    const leadId = webhookData.leads?.status?.[0]?.id ||
                   webhookData.leads?.add?.[0]?.id ||
                   webhookData['leads[status][0][id]'];

    const newStatusId = webhookData.leads?.status?.[0]?.status_id ||
                        webhookData['leads[status][0][status_id]'];

    const newPipelineId = webhookData.leads?.status?.[0]?.pipeline_id ||
                          webhookData['leads[status][0][pipeline_id]'];

    if (!leadId) {
      console.log('No lead ID found in webhook, ignoring');
      return res.status(200).json({ message: 'No lead ID in webhook' });
    }

    console.log(`Lead ID: ${leadId}, Status: ${newStatusId}, Pipeline: ${newPipelineId}`);

    // Check if this webhook matches our trigger conditions
    if (!shouldTrigger(newPipelineId, newStatusId)) {
      console.log('Webhook does not match trigger conditions, ignoring');
      return res.status(200).json({ message: 'Trigger conditions not met' });
    }

    console.log('Trigger conditions met, processing lead...');

    // Initialize clients
    const kommo = new KommoClient();
    const googleDocs = new GoogleDocsClient();

    // Fetch full lead details
    console.log('Fetching lead details...');
    const leadData = await kommo.getLead(leadId);
    const lead = leadData._embedded?.leads?.[0] || leadData;

    console.log('Lead fetched:', lead.name);

    // Check if contract already exists (check custom field 768137)
    const existingContractLink = kommo.getCustomFieldValue(lead, settings.kommo.linkFieldId);
    if (existingContractLink) {
      console.log('Contract already exists for this lead:', existingContractLink);
      return res.status(200).json({
        success: true,
        message: 'Contract already exists, skipping creation',
        leadId,
        existingLink: existingContractLink,
      });
    }

    console.log('No existing contract found, creating new one...');

    // Extract custom field values and build replacements
    const replacements = {};

    for (const [fieldId, placeholder] of Object.entries(fieldMapping)) {
      const value = kommo.getCustomFieldValue(lead, fieldId);
      replacements[placeholder] = value || '';
      console.log(`${placeholder} = "${value}"`);
    }

    // Generate document title using "Nome Completo" field
    const nomeCompleto = kommo.getCustomFieldValue(lead, '764177') || lead.name;
    const date = new Date().toISOString().split('T')[0];
    const documentTitle = `Contrato - ${nomeCompleto} - ${date}`;

    // Create contract document
    console.log('Creating contract document...');
    const document = await googleDocs.createContract(
      settings.googleDrive.templateDocId,
      documentTitle,
      replacements,
      settings.googleDrive.folderId,
      settings.googleDrive.shareWith,
      settings.googleDrive.shareRole
    );

    console.log('Document created:', document.link);

    // Send contract to Autentique if enabled
    let autentiqueDocument = null;
    if (settings.autentique.enabled) {
      try {
        console.log('Autentique integration is enabled, sending contract for signature...');

        // Get lead email from custom field 768253
        const leadContactEmail = kommo.getCustomFieldValue(lead, '768253');

        if (!leadContactEmail) {
          console.warn('No email found in custom field 768253, skipping Autentique');
          console.warn('Lead custom fields:', JSON.stringify(lead.custom_fields_values, null, 2));
        } else {
          console.log(`Found lead contact email: ${leadContactEmail}`);

          // Initialize Autentique client
          const autentique = new AutentiqueClient();

          // Send contract for signature
          autentiqueDocument = await autentique.sendContractForSignature(
            document.id,
            documentTitle,
            leadContactEmail,
            nomeCompleto
          );

          console.log('Contract sent to Autentique:', autentiqueDocument.primaryLink);

          // Update Autentique link custom field if configured
          if (settings.kommo.autentiqueLinkFieldId) {
            console.log(`Updating custom field ${settings.kommo.autentiqueLinkFieldId} with Autentique link...`);
            try {
              await kommo.updateLeadCustomField(
                leadId,
                settings.kommo.autentiqueLinkFieldId,
                autentiqueDocument.primaryLink
              );
              console.log('Autentique link custom field updated successfully');
            } catch (error) {
              console.error('Error updating Autentique link custom field:', error.message);
              // Continue even if field update fails
            }
          }
        }
      } catch (error) {
        console.error('Error sending contract to Autentique:', error.message);
        // Continue even if Autentique fails - at least we have the Google Doc
      }
    }

    // Update custom field with document link if configured
    if (settings.kommo.linkFieldId) {
      console.log(`Updating custom field ${settings.kommo.linkFieldId} with document link...`);
      try {
        await kommo.updateLeadCustomField(leadId, settings.kommo.linkFieldId, document.link);
        console.log('Custom field updated successfully');
      } catch (error) {
        console.error('Error updating custom field:', error.message);
        // Continue even if field update fails
      }
    }

    // Post link back to Kommo as note if enabled
    if (settings.kommo.postLinkToLead) {
      console.log('Posting document link to Kommo as note...');
      try {
        let noteText = settings.kommo.noteTemplate.replace('{link}', document.link);

        // Add Autentique link to note if available
        if (autentiqueDocument?.primaryLink) {
          noteText += `\nAutentique: ${autentiqueDocument.primaryLink}`;
        }

        await kommo.addNoteToLead(leadId, noteText);
        console.log('Note posted to Kommo');
      } catch (error) {
        console.error('Error adding note:', error.message);
        // Continue even if note fails
      }
    }

    // Return success response
    const response = {
      success: true,
      leadId,
      documentId: document.id,
      documentLink: document.link,
    };

    // Add Autentique info to response if available
    if (autentiqueDocument) {
      response.autentique = {
        documentId: autentiqueDocument.id,
        primaryLink: autentiqueDocument.primaryLink,
        signatures: autentiqueDocument.signatures,
      };
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error processing webhook:', error);

    // Return error response but with 200 status to prevent Kommo from retrying
    return res.status(200).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Check if webhook should trigger contract creation
 * @param {number} pipelineId - Pipeline ID from webhook
 * @param {number} statusId - Status ID from webhook
 * @returns {boolean} True if should trigger
 */
function shouldTrigger(pipelineId, statusId) {
  const triggerConfig = settings.trigger;

  // If no trigger configuration, trigger on all webhooks
  if (!triggerConfig.pipelineId && !triggerConfig.statusId) {
    return true;
  }

  // Check pipeline match
  if (triggerConfig.pipelineId && parseInt(pipelineId) !== parseInt(triggerConfig.pipelineId)) {
    return false;
  }

  // Check status match
  if (triggerConfig.statusId && parseInt(statusId) !== parseInt(triggerConfig.statusId)) {
    return false;
  }

  return true;
}
