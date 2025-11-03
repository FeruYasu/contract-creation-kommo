/**
 * Kommo API Client
 *
 * Handles all interactions with Kommo CRM API
 */

const axios = require('axios');

class KommoClient {
  constructor() {
    this.baseURL = process.env.KOMMO_DOMAIN; // e.g., https://yourcompany.kommo.com
    this.accessToken = process.env.KOMMO_ACCESS_TOKEN;

    if (!this.baseURL || !this.accessToken) {
      throw new Error('KOMMO_DOMAIN and KOMMO_ACCESS_TOKEN must be set in environment variables');
    }

    this.client = axios.create({
      baseURL: `${this.baseURL}/api/v4`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get lead details by ID
   * @param {number} leadId - The lead ID
   * @returns {Promise<Object>} Lead data
   */
  async getLead(leadId) {
    try {
      const response = await this.client.get(`/leads/${leadId}`, {
        params: {
          with: 'contacts', // Include contact information
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching lead from Kommo:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get contact details by ID
   * @param {number} contactId - The contact ID
   * @returns {Promise<Object>} Contact data
   */
  async getContact(contactId) {
    try {
      const response = await this.client.get(`/contacts/${contactId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching contact from Kommo:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Extract custom field value from lead or contact data
   * @param {Object} entity - Lead or contact object
   * @param {string} fieldId - Custom field ID
   * @returns {string|null} Field value or null if not found
   */
  getCustomFieldValue(entity, fieldId) {
    const customFields = entity.custom_fields_values || [];
    const field = customFields.find(f => f.field_id === parseInt(fieldId));

    if (!field || !field.values || field.values.length === 0) {
      return null;
    }

    // Handle different field types
    const value = field.values[0];

    // For most fields, return the value property
    if (value.value !== undefined) {
      return value.value;
    }

    // For some special fields, might need enum_code or enum
    if (value.enum_code) {
      return value.enum_code;
    }

    if (value.enum) {
      return value.enum;
    }

    return null;
  }

  /**
   * Update a custom field in a lead
   * @param {number} leadId - The lead ID
   * @param {string} fieldId - Custom field ID
   * @param {string} value - Value to set
   * @returns {Promise<Object>} Updated lead data
   */
  async updateLeadCustomField(leadId, fieldId, value) {
    try {
      const response = await this.client.patch(`/leads/${leadId}`, {
        custom_fields_values: [
          {
            field_id: parseInt(fieldId),
            values: [
              {
                value: value,
              },
            ],
          },
        ],
      });
      return response.data;
    } catch (error) {
      console.error('Error updating lead custom field:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Add a note to a lead
   * @param {number} leadId - The lead ID
   * @param {string} noteText - The note content
   * @returns {Promise<Object>} Created note data
   */
  async addNoteToLead(leadId, noteText) {
    try {
      const response = await this.client.post('/leads/notes', [
        {
          entity_id: parseInt(leadId),
          note_type: 'common',
          params: {
            text: noteText,
          },
        },
      ]);
      return response.data;
    } catch (error) {
      console.error('Error adding note to lead:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get all custom fields for debugging/discovery
   * @returns {Promise<Object>} Custom fields data
   */
  async getCustomFields() {
    try {
      const response = await this.client.get('/leads/custom_fields');
      return response.data;
    } catch (error) {
      console.error('Error fetching custom fields:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Extract email from contact object
   * Email is a system field in Kommo with field_code 'EMAIL'
   * @param {Object} contact - Contact object from Kommo API
   * @returns {string|null} Email address or null if not found
   */
  getContactEmail(contact) {
    if (!contact || !contact.custom_fields_values) {
      return null;
    }

    // Look for EMAIL field (system field with field_code)
    const emailField = contact.custom_fields_values.find(
      field => field.field_code === 'EMAIL'
    );

    if (!emailField || !emailField.values || emailField.values.length === 0) {
      return null;
    }

    // Return the first email value
    return emailField.values[0]?.value || null;
  }

  /**
   * Extract phone from contact object
   * Phone is a system field in Kommo with field_code 'PHONE'
   * @param {Object} contact - Contact object from Kommo API
   * @returns {string|null} Phone number or null if not found
   */
  getContactPhone(contact) {
    if (!contact || !contact.custom_fields_values) {
      return null;
    }

    // Look for PHONE field (system field with field_code)
    const phoneField = contact.custom_fields_values.find(
      field => field.field_code === 'PHONE'
    );

    if (!phoneField || !phoneField.values || phoneField.values.length === 0) {
      return null;
    }

    // Return the first phone value
    return phoneField.values[0]?.value || null;
  }
}

module.exports = KommoClient;
