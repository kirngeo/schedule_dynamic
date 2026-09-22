/*
try {
    import 'https://ka-f.webawesome.com/webawesome@3.12.0/components/select/select.js';
} catch (e) {
    console.log(e);
}
*/

class Subschedule extends HTMLElement {
}

class Transition extends HTMLElement {
}

class DynamicSchedulePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._domain = 'dynamic_schedule';
    this._domaindot = this._domain + '.';
    this._scheduleStates = [];
    this._scheduleConfigs = {};
    this._schedulesOverview = [];
    this._hasFetchedConfigs = false;
    this._hasFetchedScripts= false;
    this._zoomLevel = 0.5;
    this._dragState = null;
    this._wasDragging = false;
    this._activeScheduleOverview = null;
    this._editingConfig = null;
    this._eligibleScriptConfigs = [];
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
      this.shadowRoot.addEventListener('click', this._onClick.bind(this));
      this.shadowRoot.addEventListener('change', this._onChange.bind(this));
      this.shadowRoot.addEventListener('select', this._onSelect.bind(this));
  }

  showToast(message) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
          detail: { message },
          bubbles: true,
          composed: true
      }));
  }

  _onSelect(e) {
      console.log('_onSelect', e );
      console.log( e.target );
  }

  _onChange(e) {
      console.log('_onChange', e );
      console.log( e.target );

      let clicked = null;

      clicked = e.target.closest( '#schedule-sel-entid');
      if (clicked) {
          e.preventDefault();
          this._onSchedSelClick();
 //         this.setShowingEntid( clicked.value );
 //         if (this._activeScheduleOverview) {
 //             this._editingConfig = structuredClone( this._scheduleConfigs[ this._domaindot + this._activeScheduleOverview.entid ]);
 //         }
          this.render();
          return;
      }

  }

  _onSchedSelClick() {
      const new_entid = this.shadowRoot.getElementById("schedule-sel-entid").value;
      this.setShowingEntid( new_entid );
      this._startEditing();
      this.render();
  }

  async _onTestClick() {
  }

  async _onClick(e) {
    //  console.log('_onClick', e );
    //  console.log( e.target );

      let clicked = null;
      let clicked2 = null;
      let clicked3 = null;
      let clicked4 = null;

      clicked = e.target.closest('#main-test-btn');
      if (clicked) {
          e.preventDefault();
          if (!this._activeScheduleOverview) return;

          let dummy = structuredClone( this._scheduleConfigs[ this._domaindot + this._activeScheduleOverview.entid ]);
          console.log( 'test1', dummy);

          let ent = {at: {hh: 1, mm:2, ss:3}, state: 45};
          let ent2 = {at: {hh: 9, mm:0}, state: 18};
          let ent3 = {at: {hh: 12}, state: 31};
   //       dummy.sub_schedules['Tue'].transitions.push( ent);
   //       dummy.sub_schedules['Tue'].transitions.push( ent2);
   //       dummy.sub_schedules['Tue'].transitions.push( ent3);
    //      dummy.name = 'Lounge Heating';
          delete dummy.sub_schedules['Off'];
          delete dummy.sub_schedules['Mon'];

          delete dummy.attributes['next_event'];
          delete dummy.attributes['next_state'];
          delete dummy.attributes['last_offset_refresh'];

          dummy.type = this._domain + '/update';
          dummy[ this._domain + '_id' ] = this._activeScheduleOverview.entid;
          dummy[ 'id' ] = this._activeScheduleOverview.entid;

        //  delete dummy.attributes;
        //  delete dummy.n_attr_transitions;

          console.log('dummy', dummy);

          const returned = await this._hass.connection.sendMessagePromise(dummy);
          console.log('returned', returned );
          
          return;
      }

      clicked = e.target.closest('#new-schedule-btn');
      if (clicked) {
          e.preventDefault();
          const iconBool = this.shadowRoot.getElementById('schedule-bool');
          if (iconBool) iconBool.checked = false;
          this._openNewScheduleModal();
          return;
      }

      clicked = e.target.closest('#add-subschedule');
      if (clicked) {
          e.preventDefault();
          this._openNewSubScheduleModal();
          console.log('add subschedule');
          return;
      }

      clicked  = e.target.closest('#modal-cancel-btn');
      clicked2 = e.target.closest('#modal-close-btn');
      clicked3 = e.target.closest('#modal-sub-cancel-btn');
      clicked4 = e.target.closest('#modal-sub-close-btn');
      if (clicked || clicked2 || clicked3 || clicked4) {
          e.preventDefault();
          this._closeModal();
          return;
      }

      clicked = e.target.closest('#modal-test-btn');
      if (clicked) {
          e.preventDefault();
          const iconBool = this.shadowRoot.getElementById('schedule-bool');
          console.log('iconBool', iconBool);
          console.log('iconBool.checked', iconBool.checked);
          return;
      }

      if (e.target.id === 'schedule-modal') {
          e.preventDefault();
          this._closeModal();
          return;
      }

      clicked = e.target.closest('#modal-sub-submit-btn');
      if (clicked) {
          e.preventDefault();
          this._onCreateSubScheduleSubmit();
          return;
      }

      clicked = e.target.closest('#tester');
      if (clicked) {
          e.preventDefault();
          return;
      }

  }

  _startEditing() {
      if (this._editingConfig) {
          console.error('startEditing : already editing', this._editingConfig );
          return;
      };

      if (this._activeScheduleOverview) {
          console.log('starting to edit');
          this._editingConfig = structuredClone( this._scheduleConfigs[ this._domaindot + this._activeScheduleOverview.entid ]);
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
      let modal = this.shadowRoot.getElementById('schedule-modal');
      if (modal) {
          modal.classList.remove('open');
      }
      modal = this.shadowRoot.getElementById('subschedule-modal');
      if (modal) {
          modal.classList.remove('open');
      }
  }

  _openNewSubScheduleModal() {
      const modal = this.shadowRoot.getElementById('subschedule-modal');
      if (modal) {
          // Reset form fields
       //   this.shadowRoot.getElementById('schedule-name').value = '';
       //   this.shadowRoot.getElementById('schedule-icon').value = 'mdi:table-clock';
          
          modal.classList.add('open');
      }
  }

  _closeModal() {
      const modal = this.shadowRoot.getElementById('subschedule-modal');
      if (modal) {
          modal.classList.remove('open');
      }
  }

  async _onCreateSubScheduleSubmit() {
      const nameInput = this.shadowRoot.getElementById('subschedule-name');
      const name = nameInput ? nameInput.value.trim() : '';
      const scheduleConfig = this._scheduleConfigs[ this._domaindot + this._activeScheduleOverview.entid ];
      let sub_schedules = scheduleConfig.sub_schedules;

      if (name.length === 0) {
          this.showToast('subschedule name must be nonblank, with alphanumerics and underlines only');
          return;
      }

      if ( Object.keys( sub_schedules ).indexOf(name) >= 0 ) {
          this.showToast('subschedule name must be unique within the schedule');
          return;
      }

      sub_schedules[ name ] = {transitions: []};
      
      try {
          let parms = {
              name: this._activeScheduleOverview.entid,
              type: this._domain + '/update',
              sub_schedules : sub_schedules
          };
          parms[ this._domain + '_id' ] = this._activeScheduleOverview.entid;

          console.log('parms', parms);

          const returned = await this._hass.connection.sendMessagePromise(parms);
          console.log('returned', returned );
          
          this.showToast(`sub-schedule "${name}" added successfully`);
          this._closeModal();
          this.fetchScheduleConfigs();
          this.setShowingEntid( returned.id );
          this.render();
      } catch (err) {
          console.error("Failed to add sub-schedule.", err);
          this.showToast(`Failed to add sub-schedule: ${err.message || 'Unknown error'}`);
      }

  }

  transToPc (trans) {
      return this.transToSecs(trans) / (24*60*60);
  }

  transToSecs( trans ) {
      try {
          const at = trans.at;
          return (((at.hh * 60) + at.mm) * 60) + at.ss;
      } catch(e) {console.log(e); return 0;}
  }

  async _onCreateScheduleSubmit() {
      const nameInput = this.shadowRoot.getElementById('schedule-name');
      const iconInput = this.shadowRoot.getElementById('schedule-icon');
      const iconBool = this.shadowRoot.getElementById('schedule-bool');

      const name = nameInput ? nameInput.value.trim() : '';
      const icon = iconInput ? iconInput.value.trim() : 'mdi:table-clock';
      const bool = iconBool ? iconBool.checked : false;
      
      if (!name) {
          this.showToast('Please enter a dynamic schedule name');
          return;
      }

      const updatedConfig = {};
      
      try {
          const parms = {
              type: this._domain + '/create',
              name: name,
              icon: icon || 'mdi:table-clock',
              "boolean" : Boolean( bool ),
              ...updatedConfig
          };
/* eg parms
{
  "type": "dynamic_schedule/create",
  "name": "Mixed-Case Name",
  "icon": "mdi:table-clock",
  "boolean": false,
  "id": 44
}
*/

          const returned = await this._hass.connection.sendMessagePromise(parms);
/* eg returned
{
  "id": "mixed_case_name",
  "name": "Mixed-Case Name",
  "icon": "mdi:table-clock",
  "boolean": false,
  "select_script": " -missing-",
  "sub_schedules": {},
  "attributes": {},
  "n_attr_transitions": 0
}
*/
          
          this.showToast(`Dynamic Schedule "${name}" created successfully`);
          this._closeModal();
          this.fetchScheduleConfigs();
          this.setShowingEntid( returned.id );
          this.render();
      } catch (err) {
          console.error("Failed to create dynamic schedule.", err);
          this.showToast(`Failed to create dynamic schedule: ${err.message || 'Unknown error'}`);
      }
  }

  setShowingEntid( entid ) {
    if (this._schedulesOverview.length === 0) {
        this._activeScheduleOverview = null;
    } else if (this._schedulesOverview.length === 1) {
        this._activeScheduleOverview = this._schedulesOverview[0];
    } else {
      const ent = this._schedulesOverview.filter( entry => entry.entid === entid );
      if (ent.length === 1) {
        this._activeScheduleOverview = ent[0];
      } else {
        this._activeScheduleOverview = null;
      }
    }
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    // Initial fetch of detailed blocks if possible
    if (this._hass && !this._hasFetchedConfigs) {
        this._hasFetchedConfigs = true;
        this.fetchScheduleConfigs();
        this.fetchScriptConfigs();
    } else if (this._hass && this._hasFetchedConfigs && oldHass) {
        // Detect if any schedule states changed (e.g. user edited a schedule in the dialog)
        const oldSchedules = Object.values(oldHass.states).filter(state => state.entity_id.startsWith( this._domaindot));
        const newSchedules = Object.values(this._hass.states).filter(state => state.entity_id.startsWith( this._domaindot));
        
        // If the state objects differ (like last_updated changed), re-fetch the details
        if (JSON.stringify(oldSchedules) !== JSON.stringify(newSchedules)) {
            this.fetchScheduleConfigs();
        }

        // Detect if any script states changed or populated
        const oldScripts = Object.values(oldHass.states).filter(state => state.entity_id.startsWith('script.'));
        const newScripts = Object.values(this._hass.states).filter(state => state.entity_id.startsWith('script.'));
        
        if (JSON.stringify(oldScripts) !== JSON.stringify(newScripts)) {
            this.fetchScriptConfigs();
        }

    }

    this.updateSchedules();

      /*
    // Initial fetch of scripts which are eligible to be selectors
    if (this._hass && !this._hasFetchedScripts) {
        this._hasFetchedScripts = true;
        this.fetchScriptDetails();
    }
*/

  }

  updateSchedules() {
    if (!this._hass) return;

    // Filter all schedule entities from states
    const newScheduleStates = Object.values(this._hass.states).filter(state =>
      state.entity_id.startsWith( this._domaindot)
    );

    // Simple diff
    if (JSON.stringify(newScheduleStates) !== JSON.stringify(this._scheduleStates)) {
      this._scheduleStates = newScheduleStates;
      this.render();
    } else if (!this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  async fetchScriptConfigs() {
      try {
          this._eligibleScriptConfigs = [];
          const scriptEntities = Object.keys(this._hass.states).filter(id => id.startsWith('script.'));
          const promises = scriptEntities.map(async (entityId) => {
              try {
                  const stateObj = this._hass.states[entityId];
                  const response = await this._hass.connection.sendMessagePromise({
                      type: 'script/config',
                      entity_id: entityId
                  });
                  if (response) {
                      let config = response.config || response.raw_config || response;
                      const sequence = config ? config.sequence : null;
                      if (sequence) {
                          if (( Array.isArray(sequence) ? sequence : [sequence])
                              .filter( (seq)=>{ return !!seq.response_variable} )
                              .length > 0) {
                              config.id = entityId;
                              return config;
                          }
                      }
                  }
              } catch (err) {
                  console.error(`[Schedule Panel Debug] Failed to fetch config for ${entityId}:`, err);
              }
              return null;
          });

          const results = await Promise.all(promises);
          this._eligibleScriptConfigs = results
              .filter(auto => auto !== null)
              .sort((a,b) => a.alias.localeCompare(b.alias));
      } catch (err) {
          console.error("[Schedule Panel Debug] Global error in fetchScriptConfigss:", err);
      }

      console.log('_eligibleScriptConfigs', this._eligibleScriptConfigs);
  }


  async fetchScheduleConfigs() {
 //     try {
          let parms2 = {nothing: 0};
          let response = null;
          this._schedulesOverview = Object.values(this._hass.states)
              .filter(state => state.entity_id.startsWith( this._domaindot))
              .map(state => ({
                  'entid'  : state.entity_id.replace( this._domaindot, ''),
                  'name'   : Object.hasOwn(state,'attributes') && state.attributes.friendly_name ? state.attributes.friendly_name : state.entity_id,
                  'edit' : Boolean( Object.hasOwn(state,'attributes') && state.attributes.editable)
                  }))
              .sort((a,b) => a.name.localeCompare(b.name));

          if (this._schedulesOverview.length === 0) return;

          // Fetch the configured time ranges directly using the service
          parms2 = {
              type: 'call_service',
              domain: this._domain,
              service: 'get_schedule',
         //     target: { entity_id: this._schedulesOverview.map( a => a.entid ) },
              target: { entity_id: 'all' },
              return_response: true
          };
          try {
            response = await this._hass.connection.sendMessagePromise(parms2);
              /*
          const response = await this._hass.connection.sendMessagePromise({
              type: 'call_service',
              domain: this._domain,
              service: 'get_schedule',
              target: { entity_id: this._schedulesOverview.map( a => a.entid ) },
              return_response: true
          });
          */
          } catch(e) {
              console.log( 'call_service error', parms2, e);
              throw new Error( 'urg' );
          }
          
          console.log('response to  get_schedule', this._schedulesOverview.map( a=>a.entid) );
          console.log( response );

          if (response && response.response) {
              // The response is keyed by entity_id: { 'schedule.my_schedule': { monday: [...], ... } }
              this._scheduleConfigs = response.response;
           //   console.log( 'response', response.response );
              this.render(); // Re-render with real details
          }

          console.log('fetchScheduleConfigs success');
 //     } catch (err) {
 //      //   this._hasFetchedConfigs = false;
 //         console.log("Could not fetch detailed schedule configs.", err);
 //     }

  }

  render() {

    let contentHtml = '';
    let schedselHtml = '';
    let subsched_names = [];
    let subscheds = {};
    let timeGutterHeaderHtml = '';
    let scheduleConfig = null;

    if (this._schedulesOverview.length > 0) {

      schedselHtml += `<select class="icon-btn" id="schedule-sel-entid">`
      this._schedulesOverview.forEach( ent => {
        let selected = false;

        if ((this._activeScheduleOverview !== null) && (ent.entid === this._activeScheduleOverview.entid)) {
            selected = true;
        }

        if (this._schedulesOverview.length === 1) {
            selected = true;
        }

       schedselHtml += `<option ${selected  ? "selected " : ""}value="${ent.entid}">${ent.name}</option>`;

        });
      schedselHtml += `</select>`;

      if (this._activeScheduleOverview === null) {
        this._activeScheduleOverview = this._schedulesOverview[0];
        this._startEditing();
      }

    }

    if (this._activeScheduleOverview !== null) {
      scheduleConfig = this._scheduleConfigs[ this._domaindot + this._activeScheduleOverview.entid ];

 //     console.log( 'xx', this._editingConfig, this._activeScheduleOverview);
 //     if ( !this._editingConfig   &&  this._activeScheduleOverview.edit ) {
 //         this._editingConfig = structuredClone( scheduleConfig);
 //     }

   //   console.log( 'scheduleConfig', this._domaindot + this._activeScheduleOverview.entid, scheduleConfig);
      subscheds = scheduleConfig ? scheduleConfig.sub_schedules : {};
      subsched_names = Object.keys(subscheds).sort((a,b) => a.localeCompare(b));
      contentHtml += `<div>${JSON.stringify( this._activeScheduleOverview, null, "  " )}</div>`;
      contentHtml += `<div>scheduleConfigs<pre>${JSON.stringify( this._scheduleConfigs, null, "  " )}</pre></div>`;
      contentHtml += `<div>editingConfig<pre>${JSON.stringify( this._editingConfig, null, "  " )}</pre></div>`;
      contentHtml += `<div>scheduleConfig<pre>${JSON.stringify( scheduleConfig, null, "  " )}</pre></div>`;
 //     contentHtml += `<div>subscheds<pre>${JSON.stringify( subscheds, null, "  " )}</pre></div>`;
 //     contentHtml += `<div>subsched_names<pre>${JSON.stringify( subsched_names, null, "  " )}</pre></div>`;
    } else if (this._schedulesOverview.length > 0) {
      contentHtml = 'please select a dynamic schedule';
    } else {
      contentHtml = 'no dynamic schedules exist yet';
    }

    // subschedule columns
    let subschedHtml = '';

    // time gutter header 
    // 1) add a subschedule
    timeGutterHeaderHtml += `
          <button style="font-size: 0.75em;" id="add-subschedule" class="XXicon-btn-small style="XXbackground-color:;"" title="add a subschedule">
              <ha-icon icon="mdi:plus"></ha-icon>
          </button>
    `;


    // Time Gutter (Y-Axis)
    const timeGutterHtml = `
        <div class="time-gutter">
            ${Array.from({length: 24}).map((_, i) => `
                <div class="time-slot"><span>${i.toString().padStart(2, '0')}:00</span></div>
            `).join('')}
        </div>
    `;

    let subschedNamesHtml = subsched_names.map((sub, inx) => `
      <div class="sub-header">${sub}</div>
    `).join('');

    subschedNamesHtml = `
      <div class="sub-hrows">
       ${subschedNamesHtml}
      </div>
      `;

    console.log('XX scheduleConfig', scheduleConfig);

    let subschedTransitionsHtml = subsched_names.map( (sub, inx) => {
        let cont = `<div class="sub-header">`;
        let subsched = scheduleConfig.sub_schedules[ sub ];
        subsched.transitions.map( (trans, tinx) => {
          cont += `<div style="top;${this.transToPc(trans)}%;">${JSON.stringify(trans)} ${inx} ${tinx} secs=${this.transToSecs(trans)}</div>`
        });
        cont += '</div>';
        return cont;
    }).join('');

    subschedTransitionsHtml = `
      <div class="sub-transitions">
       ${subschedTransitionsHtml}
      </div>
      `;

    let allContentHtml = '';
    let zoomHtml = '';

    if (this._activeScheduleOverview !== null) {
      allContentHtml = `
      <div class="content">
        <ha-card class="all-subschedules">
          <div class="subs-ed-ctr">
            <div class="time-gutter-header">
             ${timeGutterHeaderHtml}
            </div>
            <div id="sub-header">
             ${subschedNamesHtml}
            </div>
            <div id="time-gutter">
             ${timeGutterHtml}
            </div>
            <div id="subs">
             ${subschedTransitionsHtml}
            </div>
          </div>
        </ha-card>
        <ha-card class="schedule-details">
          ${contentHtml}
        </ha-card>
      </div>
      `;

      zoomHtml = `
          <button class="icon-btn" onclick="this.getRootNode().host.zoomOut()" title="Zoom Out">
              <ha-icon icon="mdi:magnify-minus"></ha-icon>
          </button>
          <button class="icon-btn" onclick="this.getRootNode().host.zoomIn()" title="Zoom In">
              <ha-icon icon="mdi:magnify-plus"></ha-icon>
          </button>
      `;
    }

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
/*
div {
   outline:1px blue solid;
   padding: 2px;
   margin: 2px;
 }
*/
        * {
            box-sizing: border-box;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            max-width: 1400px;
            margin-left: auto;
            margin-right: auto;
        }

        .title {
            font-size: 28px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--primary-text-color);
        }

        .title ha-icon {
            color: var(--primary-color);
            --mdc-icon-size: 32px;
        }
        
        .zoom-controls {
            display: flex;
            gap: 8px;
        }

        .icon-btn {
            background: var(--secondary-background-color);
            border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            color: var(--primary-text-color);
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .icon-btn-small {
            background: var(--secondary-background-color);
            border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            color: var(--primary-text-color);
            cursor: pointer;
       //     padding: 8px;
       //     border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .icon-btn:hover {
            background-color: var(--primary-color);
            color: white;
            border-color: var(--primary-color);
        }

        .time-gutter-header {
            justify-content: flex-end;
            align-items: center;
        }

        .content {
            max-width: 1400px;
            margin: 0 auto;
        }

        .sub-hrows {
            display: grid;
            grid-template-columns: repeat(${subsched_names.length}, [col-start] 1fr);
        }

        .sub-transitions {
            height: 100%;
            display: grid;
            grid-template-columns: repeat(${subsched_names.length}, [col-start] 1fr);
        }

        .subs-ed-ctr {
            display: grid;
            grid-template-columns: min-content auto;
        }

        .sub-headers {
            display: flex;
            flex: 1;
            min-width: 700px;
        }

        .sub-header {
            flex: 1;
            text-align: center;
            padding: 12px;
            font-weight: 600;
            font-size: 14px;
            color: var(--secondary-text-color);
            border-right: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            background-color: var(--secondary-background-color);
            letter-spacing: 0.5px;
        }

        .sub-header.today {
            color: var(--primary-color);
            border-bottom: 2px solid var(--primary-color);
        }

        .Xtime-gutter-header {
            width: 60px;
            flex-shrink: 0;
            border-right: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            background-color: var(--secondary-background-color);
        }

        .time-gutter {
            width: 60px;
            flex-shrink: 0;
            border-right: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            background-color: var(--card-background-color);
            position: sticky;
            left: 0;
            z-index: 10;
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
              overflow: auto;
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


        /* Form groups */
        .form-group {
            margin-bottom: 16px;
        }

        .form-row {
            display: flex;
            gap: 16px;
        }

        .form-row .form-group {
            flex: 1;
        }

        .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--secondary-text-color);
        }

        .form-group input[type="text"],
        .form-group input[type="time"] {
            width: 100%;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.2));
            background-color: var(--primary-background-color);
            color: var(--primary-text-color);
            font-family: inherit;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
        }

        .form-group input[type="text"]:focus,
        .form-group input[type="time"]:focus {
            border-color: var(--primary-color);
        }

        /* Buttons */
        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            padding-top: 16px;
        }

        .btn {
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
        }

        .btn.primary {
            background-color: var(--primary-color);
            color: white;
        }

        .btn.primary:hover {
            filter: brightness(1.1);
        }

        .btn.secondary {
            background-color: var(--secondary-background-color);
            color: var(--primary-text-color);
            border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        }

        .btn.secondary:hover {
            background-color: var(--divider-color, rgba(0, 0, 0, 0.05));
        }


      </style>

      <div class="header">
          <div class="title" id="tester">
              <ha-icon icon="mdi:table-clock"></ha-icon>
              Dynamic Schedules
          </div>
          <div class="zoom-controls">
              <button class="icon-btn" id="main-test-btn" title="test">test</button>
              ${schedselHtml}
              <button class="icon-btn" id="new-schedule-btn" title="New Schedule" style="padding-left: 12px; padding-right: 12px; gap: 8px;">
                  <ha-icon icon="mdi:plus"></ha-icon> New Dynamic Schedule
              </button>
              ${zoomHtml}
          </div>
      </div>

      ${allContentHtml}

      <div id="schedule-modal" class="modal-overlay">
          <div class="modal-content">
              <div class="modal-header">
                  <h2>Create New Dynamic Schedule</h2>
                  <button class="close-btn" id="modal-close-btn">&times;</button>
              </div>
              <form id="schedule-form" onsubmit="return false;">
                  <div class="form-group">
                      <ha-settings-row>
                          <span slot="heading">Name</span>
                          <span slot="description"the name of the dynamic schedule</span>
                          <ha-input
                            placeholder="e.g Heating Schedule"
                            id="schedule-name"
                          >
                          </ha-input>
                      </ha-settings-row>
                  </div>
                  <div class="form-group">
                      <ha-settings-row>
                          <span slot="heading">Icon</span>
                          <ha-icon-picker
                            id="schedule-icon"
                            value="mdi:table-clock"
                          >
                          </ha-icon-picker>
                      </ha-settings-row>
                  </div>
                  <div class="form-group">
                      <ha-settings-row>
                          <span slot="heading">boolean state</span>
                          <span slot="description">entity states will be boolean</span>
                          <ha-switch
                            id="schedule-bool"
                          >
                          </ha-switch>
                      </ha-settings-row>
                  </div>
                  <div class="modal-footer">
                      <button type="button" class="btn secondary" id="modal-test-btn">Test</button>
                      <button type="button" class="btn secondary" id="modal-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-submit-btn">Create Dynamic Schedule</button>
                  </div>
              </form>
          </div>
      </div>


      <div id="subschedule-modal" class="modal-overlay">
          <div class="modal-content">
              <div class="modal-header">
                  <h2>Create New Sub-schedule</h2>
                  <button class="close-btn" id="modal-sub-close-btn">&times;</button>
              </div>
              <form id="schedule-form" onsubmit="return false;">
                  <div class="form-group">
                      <ha-settings-row>
                          <span slot="heading">Sub-schedule name</span>
                          <span slot="description"the name of the sub-schedule</span>
                          <ha-input
                            placeholder="alphanumerics or underlines only"
                            id="subschedule-name"
                          >
                          </ha-input>
                      </ha-settings-row>
                  </div>
                  <div class="modal-footer">
                      <button type="button" class="btn secondary" id="modal-sub-test-btn">Test</button>
                      <button type="button" class="btn secondary" id="modal-sub-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-sub-submit-btn">Create Sub-schedule</button>
                  </div>
              </form>
          </div>
      </div>


      `;
  }

}

if (false) {
    [
      ['dynamic-schedule-panel', DynamicSchedulePanel],
      ['ds-subschedule', Subschedule],
      ['ds-transition', Transition],
    ].forEach( (el, cls) => {if (!customElements.get(el)) {customElements.define(el, cls);}} );
} else {
    if (!customElements.get('dynamic-schedule-panel')) {
        customElements.define('dynamic-schedule-panel', DynamicSchedulePanel);
    }

    if (!customElements.get('ds-subschedule')) {
        customElements.define('ds-subschedule', Subschedule);
    }

    if (!customElements.get('ds-transition')) {
        customElements.define('ds-transition', Transition);
    }
}
