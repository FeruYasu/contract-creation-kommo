/**
 * Field Discovery Helper Endpoint
 *
 * Helps discover custom field IDs and their values for a specific lead
 * Useful during initial setup and debugging
 *
 * Usage: GET /api/list-fields?lead_id=123456
 */

const KommoClient = require('../lib/kommo');

module.exports = async (req, res) => {
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lead_id } = req.query;

    if (!lead_id) {
      return res.status(400).json({
        error: 'Missing lead_id parameter',
        usage: 'GET /api/list-fields?lead_id=123456',
      });
    }

    const kommo = new KommoClient();

    // Fetch lead details
    console.log(`Fetching lead ${lead_id}...`);
    const leadData = await kommo.getLead(lead_id);
    const lead = leadData._embedded?.leads?.[0] || leadData;

    // Extract custom fields
    const customFields = lead.custom_fields_values || [];

    // Format for easy reading
    const fieldInfo = customFields.map(field => ({
      id: field.field_id,
      name: field.field_name,
      type: field.field_type,
      value: field.values?.[0]?.value || field.values?.[0]?.enum_code || field.values?.[0]?.enum || null,
      rawValues: field.values,
    }));

    // Also fetch all available custom fields metadata
    console.log('Fetching custom fields metadata...');
    const fieldsMetadata = await kommo.getCustomFields();
    const allFields = fieldsMetadata._embedded?.custom_fields || [];

    return res.status(200).json({
      lead: {
        id: lead.id,
        name: lead.name,
        status_id: lead.status_id,
        pipeline_id: lead.pipeline_id,
      },
      customFieldsInLead: fieldInfo,
      allAvailableFields: allFields.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        code: f.code,
      })),
      hint: 'Use the field IDs from customFieldsInLead to configure config/field-mapping.js',
    });

  } catch (error) {
    console.error('Error listing fields:', error);

    return res.status(500).json({
      error: error.message,
      details: error.response?.data || null,
    });
  }
};
