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

  render() {
    this.shadowRoot.innerHTML = `
      <p>Hello World</p>
      `;
  }

}

if (!customElements.get('dynamic-schedule-panel')) {
    customElements.define('dynamic-schedule-panel', DynamicSchedulePanel);
}

