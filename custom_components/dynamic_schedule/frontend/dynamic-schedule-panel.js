class DynamicSchedulePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._domain = 'dynamic_schedule';
    this._schedules = [];
    this._scheduleDetails = {};
    this._automations = [];
    this._hasFetchedDetails = false;
    this._zoomLevel = 0.5;
    this._dragState = null;
    this._wasDragging = false;
    console.log( 'constructor exit' );
  }

  zoomIn() {
      if (this._zoomLevel < 3.0) {
          this._zoomLevel += 0.25;
          this.render();
      }
  }

  zoomOut() {
      if (this._zoomLevel > 0.5) {
          this._zoomLevel -= 0.25;
          this.render();
      }
  }
  connectedCallback() {
      console.log( 'connectedCallback');
      this.shadowRoot.addEventListener('click', this._onClick.bind(this));
  }

  showToast(message) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
          detail: { message },
          bubbles: true,
          composed: true
      }));
  }

  _onClick(e) {
      console.log('_onClick', e );

      const newBtn = e.target.closest('#new-schedule-btn');
      if (newBtn) {
          e.preventDefault();
          this._openNewScheduleModal();
          return;
      }

      if (e.target.id === 'schedule-modal') {
          e.preventDefault();
          this._closeModal();
          return;
      }

  }

 _openNewScheduleModal() {
      const modal = this.shadowRoot.getElementById('schedule-modal');
      if (modal) {
          // Reset form fields
          this.shadowRoot.getElementById('schedule-name').value = '';
          this.shadowRoot.getElementById('schedule-icon').value = 'mdi:table-clock';
          
          modal.classList.add('open');
      }
  }

  _closeModal() {
      const modal = this.shadowRoot.getElementById('schedule-modal');
      if (modal) {
          modal.classList.remove('open');
      }
  }


  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    // Initial fetch of detailed blocks if possible
    if (this._hass && !this._hasFetchedDetails) {
        this._hasFetchedDetails = true;
        this.fetchScheduleDetails();
    } else if (this._hass && this._hasFetchedDetails && oldHass) {
        // Detect if any schedule states changed (e.g. user edited a schedule in the dialog)
        const oldSchedules = Object.values(oldHass.states).filter(state => state.entity_id.startsWith( this._domain + '.'));
        const newSchedules = Object.values(this._hass.states).filter(state => state.entity_id.startsWith( this._domain + '.'));
        
        // If the state objects differ (like last_updated changed), re-fetch the details
        if (JSON.stringify(oldSchedules) !== JSON.stringify(newSchedules)) {
            this.fetchScheduleDetails();
        }

    }

    this.updateSchedules();
  }

  updateSchedules() {
    if (!this._hass) return;

    // Filter all schedule entities from states
    const newSchedules = Object.values(this._hass.states).filter(state =>
      state.entity_id.startsWith( this._domain + '.')
    );

    // Simple diff
    if (JSON.stringify(newSchedules) !== JSON.stringify(this._schedules)) {
      this._schedules = newSchedules;
      this.render();
    } else if (!this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  async fetchScheduleDetails() {
      console.log( 'fetchScheduleDetails entry' )
      try {
          const scheduleEntities = Object.values(this._hass.states)
              .filter(state => state.entity_id.startsWith( this._domain + '.'))
              .map(state => state.entity_id);
          console.log( 'fetchScheduleDetails found %d dynamic schedules', scheduleEntities.length );

          if (scheduleEntities.length === 0) return;

          // Fetch the configured time ranges directly using the service
          const response = await this._hass.connection.sendMessagePromise({
              type: 'call_service',
              domain: this._domain,
              service: 'get_schedule',
              target: { entity_id: scheduleEntities },
              return_response: true
          });
          
          console.log('response to  get_schedule', scheduleEntities);
          console.log( response );

          if (response && response.response) {
              // The response is keyed by entity_id: { 'schedule.my_schedule': { monday: [...], ... } }
              this._scheduleDetails = response.response;
              console.log( JSON.stringify( response.response ) );
              this.render(); // Re-render with real details
          }

      } catch (err) {
          console.log("Could not fetch detailed schedule blocks.", err);
      }
  }

  render() {
    console.log( 'render' );

    let contentHtml = 'Hello World';
  
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --zoom-level: ${this._zoomLevel};
          display: block;
          padding: 24px;
          background-color: var(--primary-background-color);
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          min-height: 100vh;
          box-sizing: border-box;
        }

        .content {
            max-width: 1400px;
            margin: 0 auto;
        }

        /* Modal Overlay */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .modal-overlay.open {
            opacity: 1;
            pointer-events: auto;
        }

        /* Modal Content */
        .modal-content {
            background-color: var(--card-background-color, var(--primary-background-color));
            border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
            border-radius: 16px;
            width: 100%;
            max-width: 480px;
            padding: 24px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
            transform: scale(0.9);
            transition: transform 0.3s ease;
        }

        .modal-overlay.open .modal-content {
            transform: scale(1);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            padding-bottom: 12px;
        }

        .modal-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 500;
            color: var(--primary-text-color);
        }

        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--secondary-text-color);
            padding: 0;
            line-height: 1;
        }

        .close-btn:hover {
            color: var(--error-color, #ef4444);
        }


      </style>

      <div class="header">
          <div class="title">
              <ha-icon icon="mdi:table-clock"></ha-icon>
              Dynamic Schedules
          </div>
          <div class="zoom-controls">
              <button class="icon-btn" id="new-schedule-btn" title="New Schedule" style="padding-left: 12px; padding-right: 12px; gap: 8px;">
                  <ha-icon icon="mdi:plus"></ha-icon> New Dynamic Schedule
              </button>
              <button class="icon-btn" onclick="this.getRootNode().host.zoomOut()" title="Zoom Out">
                  <ha-icon icon="mdi:magnify-minus"></ha-icon>
              </button>
              <button class="icon-btn" onclick="this.getRootNode().host.zoomIn()" title="Zoom In">
                  <ha-icon icon="mdi:magnify-plus"></ha-icon>
              </button>
          </div>
      </div>

      <div class="content">
          ${contentHtml}
      </div>

      <div id="schedule-modal" class="modal-overlay">
          <div class="modal-content">
              <div class="modal-header">
                  <h2>Create New Schedule</h2>
                  <button class="close-btn" id="modal-close-btn">&times;</button>
              </div>
              <form id="schedule-form" onsubmit="return false;">
                  <div class="form-group">
                      <label for="schedule-name">Name</label>
                      <input type="text" id="schedule-name" required placeholder="e.g. Heating Schedule">
                  </div>
                  <div class="form-group">
                      <label for="schedule-icon">Icon</label>
                      <input type="text" id="schedule-icon" value="mdi:calendar-clock" placeholder="mdi:calendar-clock">
                  </div>
                  <div class="modal-footer">
                      <button type="button" class="btn secondary" id="modal-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-submit-btn">Create Schedule</button>
                  </div>
              </form>
          </div>
      </div>

      `;
  }

}

if (!customElements.get('dynamic-schedule-panel')) {
    customElements.define('dynamic-schedule-panel', DynamicSchedulePanel);
}

