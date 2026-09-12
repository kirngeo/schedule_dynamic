class DynamicSchedulePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
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
        const oldSchedules = Object.values(oldHass.states).filter(state => state.entity_id.startsWith('schedule.'));
        const newSchedules = Object.values(this._hass.states).filter(state => state.entity_id.startsWith('schedule.'));
        
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
      state.entity_id.startsWith('dynamic_schedule.')
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
              .filter(state => state.entity_id.startsWith('dynamic_schedule.'))
              .map(state => state.entity_id);
          console.log( 'fetchScheduleDetails found %d dynamic schedules', scheduleEntities.length );

          if (scheduleEntities.length === 0) return;

      } catch (err) {
          console.log("Could not fetch detailed schedule blocks.", err);
      }
  }

  render() {
    console.log( 'render' );
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
 
      </style>

      <div class="content">Hello World</div>
      `;
  }

}

if (!customElements.get('dynamic-schedule-panel')) {
    customElements.define('dynamic-schedule-panel', DynamicSchedulePanel);
}

