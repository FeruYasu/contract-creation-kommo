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
   * Add a note to a lead
   * @param {number} leadId - The lead ID
   * @param {string} noteText - The note content
   * @returns {Promise<Object>} Created note data
   */
  async addNoteToLead(leadId, noteText) {
    try {
      const response = await this.client.post('/leads/notes', {
        entity_id: leadId,
        note_type: 'common',
        params: {
          text: noteText,
        },
      });
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
}

module.exports = KommoClient;
