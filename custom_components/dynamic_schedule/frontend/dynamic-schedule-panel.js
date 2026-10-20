
class DynamicSchedulePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._name = "Dynamic Schedule";
    this._domain = this._name.toLowerCase().replaceAll(" ","_");
    this._domaindot = this._domain + '.';
    this._hasFetchedConfigs = false;
    this._hasFetchedScripts= false;
    this._allConfigs = {};  // all configs
    this._orderedIds = [];  // schedule entity ids,  alphabetic order
    this._currentConfigId = null;  // viewing config

    this._scheduleStates = [];
 //   this._scheduleConfigs = {};
 //   this._zoomLevel = 0.5;
 //   this._activeScheduleOverview = null;
    this._eligibleScriptConfigs = [];
    this._isEditing = false;
    this._editingConfig = null;
 //   this._activeScheduleId = null;
    this._dummyBase = '____' + new Date().valueOf();
    this._dummyExt = 0;

  }

  connectedCallback() {
      this.shadowRoot.addEventListener('click', this._onClick.bind(this));
      this.shadowRoot.addEventListener('change', this._onChange.bind(this));
  }

  showToast(message) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
          detail: { message },
          bubbles: true,
          composed: true
      }));
  }

  _onChange(e) {
  //    console.log('_onChange', e );

      let clicked = null;

      clicked = e.target.closest( '#schedule-sel-entid');
      if (clicked) {
          e.preventDefault();
          this._currentConfigId = clicked.value;
          this._editing = false;
          this.render();
          return;
      }

      if (e.target.classList.contains('ch')) {
          e.preventDefault();
          this._editing = true;
     //     this._editingConfig = this._gatherConfig();
          return;
      }

  }

  get _editing() {
      return this._isEditing;
  }

  set _editing( onoff ) {
      if (this._isEditing === onoff) return;
      if (onoff) {
          this._editingConfig = structuredClone( this._allConfigs[ this._currentConfigId ]);
          console.log('starting to edit, _editingConfig:', this._editingConfig);
          this.shadowRoot.querySelector('#save-btn').classList.add('dirty');
          this.shadowRoot.querySelector('#save-btn').classList.remove('clean');
      } else {
          this.shadowRoot.querySelector('#save-btn').classList.remove('dirty');
          this.shadowRoot.querySelector('#save-btn').classList.add('clean');
          console.log('stopping editing');
          this._editingConfig = null;
      }
      this._isEditing = onoff;
  }

  async _onTestClick() {
  }

  async _onClick(e) {
    //  console.log('_onClick', e );
    //  console.log( e.target );

      let clicked = null;

      clicked = e.target.closest('.ssource');
      if (clicked) {
     //     e.preventDefault();
          console.log('onClick ssource', clicked);
     //     clicked.checked = true;
          return;
      }

      clicked = e.target.closest('.rm-trans');
      if (clicked) {
          e.preventDefault();

          this._editing = true;
          const trans = clicked.closest( '.trans' );
          const tinx = trans.dataset.inx;
          const sub = trans.dataset.sub;
          trans.remove();  // remove from display

          this._editingConfig
              .sub_schedules[ sub ]
              .transitions
              .splice( tinx, 1 ); // remove from editing config
          this.render();
          return;
      }

      clicked = e.target.closest('#main-test-btn');
      if (clicked) {
          e.preventDefault();
          this.shadowRoot.querySelector('#fabp').classList.add('dirty');
          this.shadowRoot.querySelector('#save-button').classList.add('dirty');
          console.log( 'main-test-btn', this._gatherConfig() );
          return;
      }

      clicked = e.target.closest('#add-attribute');
      if (clicked) {
          console.log('add-attribute', clicked);
          this._editing = true;
          e.preventDefault();

          this._editingConfig = this._gatherConfig();
          this._editingConfig.attributes[ this._getDummyName() ] = [];
          this.render();
          return;
      }

      clicked = e.target.closest('.add-transition');
      if (clicked) {
          const ctr = clicked.closest('.sh-name');
          this._editing = true;
          e.preventDefault();

          this._editingConfig = this._gatherConfig();

          let transs = this._editingConfig
            .sub_schedules[ ctr.dataset.sub ]
            .transitions;

          console.log('adding trans to', ctr.dataset.sub, structuredClone( this._editingConfig ));
          let tsecs;

          if (transs.length) {
              let prevsecs = 0;
              let gap_before;
              let insert_inx = null;
              let gaps = [];

              // try to find a gap of >= 45 mins...
              transs.forEach( (trans, inx) => {
                  tsecs = this._transToSecs(trans);
                  gap_before = tsecs - prevsecs;
                  if ( (insert_inx === null)  &&  (gap_before >= 45*60)) {
                      insert_inx = inx;
                  }
                  gaps.push( [inx, gap_before] ); 
                  prevsecs = tsecs;
              } );
              gaps.push( [-1, (24*60*60) - prevsecs] )
              console.log('initial gaps', Array( ...gaps) );

              // arrange to insert before insert_inx
              console.log('insert_inx', insert_inx, 'transs', structuredClone( transs ) );

              if (insert_inx === 0) {
                  transs.push( {at: {hh: 0, mm:0, ss:0}, state: null} );
              } else if (insert_inx === null) {
                  gaps.sort( (a,b) => a[1] > b[1] );
                  console.log( 'sorted gaps', gaps );
                  transs.push( {at: this._secsToAt( this._transToSecs( transs[ 0 ] ) + 1 ), state: null} );
              } else {
                  transs.push( {at: this._secsToAt( this._transToSecs( transs[ insert_inx-1 ] ) + 1 ), state: null} );
              }

              if (false && insert_inx === null) {
                  // Failed to find a gap of >= 45 mins : just use the largest gap.
                  gaps.sort( (a,b) => a[1] > b[1] );
                  console.log( 'sorted gaps', gaps );
              }


          } else {
              transs.push( {at: {hh: 0, mm:0, ss:0}, state: 0} );
              console.log('pushed onto empty transs', transs.at(-1) );
          }

          let ddtsecs;

          if (false) {
          if (transs.length) {
              let prevsecs = 0;
              transs.map( (trans, inx) => {
                  tsecs = this._transToSecs(trans);
                  gaps.push( [tsecs - prevsecs, inx] );
                  prevsecs = tsecs;
              })
              gaps.push( [(24*60*60) - prevsecs, -1] );
              gaps = gaps.filter( (gap, inx) => gap[0] > 45*60 ).sort( (a, b) => a[0] > b[0] );
              console.log('gaps', gaps);

              let trans;
              if (gaps[0][1] < 0) {
                  // insert after the last transition
                  trans = transs[ transs.length - 1 ];
              } else {
                  trans = transs[ gaps[0][1] ];
              }

              transs.push( {at: this._secsToAt( this._transToSecs(trans) + 45*60 ), state: 0} );
          } else {
              transs.push( {at: {hh: 0, mm:0, ss:0}, state: 0} );
          }
          }
          transs.sort( (a,b) => this._transToSecs(a) > this._transToSecs(b) );
          console.log('added trans, editingConfig is now', structuredClone( this._editingConfig));
          this.render();

          return;
      }

      clicked = e.target.closest('.delete-subschedule');
      if (clicked) {
          e.preventDefault();
          this._editing = true;
          const data = clicked.closest( '.sh-name' ).dataset
          delete this._editingConfig.sub_schedules[ data.sub ];
          this.render();

          return;
      }

      clicked = e.target.closest('#save-button,#save-btn');
      if (clicked) {
          e.preventDefault();

          let newConfig = this._gatherConfig();

          console.log('save/gatheredConfig', structuredClone(newConfig));

          Object.keys( newConfig || {} )
              .forEach( k => {
                  if (k.startsWith("_")) {
                      delete newConfig[k];
                  }
              });

          Object.keys( newConfig.attributes || {})
              .forEach( k => {
                  console.log('checking k', k);
                  if (this._isDummyName(k)) {
                      console.log('deleting', k, newConfig.attributes);
                      delete newConfig.attributes[k];
                  }
              });


          console.log('save newConfig', structuredClone(newConfig) );

          const returned = await this._hass.connection.sendMessagePromise( newConfig );
          console.log('save returned', returned );
    ////      this.setShowingEntid( returned.id );
            
     //     this.fetchScheduleConfigs();
          this._editing = false;
          this._fetchAllConfigs();
    //      this.render();
          return;
      }

      clicked = e.target.closest('#new-schedule-btn');
      if (clicked) {
          e.preventDefault();
          this._openNewScheduleModal();
          return;
      }

      clicked = e.target.closest('#delete-schedule-btn');
      if (clicked) {
          e.preventDefault();
          this._openConfirmDeleteScheduleModal();
          return;
      }

      clicked = e.target.closest('#add-subschedule');
      if (clicked) {
          e.preventDefault();
          this._openNewSubScheduleModal();
          console.log('add subschedule');
          return;
      }

      clicked = e.target.closest( '#link-source-sch-sub-select' );
      if (clicked) {
          console.log('selected sub schedule', clicked.value);
          return;
      }

      clicked = e.target.closest( '#link-source-sch-select' );
      if (clicked) {
          console.log('selected linked schedule', clicked.value);

          let els = [];
          let opt;
          let el = document.createElement( 'select' );
          el.id = 'link-source-sch-sub-select';
          el.classList.add('ch');
          opt = document.createElement('option');
          opt.appendChild( document.createTextNode( '-- select source SUBschedule --') );
          el.appendChild( opt );
          opt.selected = true;

          this._others.forEach( oth => {
              if (clicked.value == oth.entid) {
                  oth.subs.sort( (a,b) => a.localeCompare(b) ).forEach( sub => {
                  opt = document.createElement('option');
                  opt.appendChild( document.createTextNode( sub ));
                  opt.value = sub;
                  el.appendChild(opt);
                  })
              }} );

          els.push( el );

          this.shadowRoot.getElementById( 'source-sub-ctr' ).replaceChildren( ...els );
          return;
      }

      clicked = e.target.closest('#link-subschedule');
      if (clicked) {
          e.preventDefault();
          this._openNewLinkedSubScheduleModal();
          console.log('add linked subschedule');
          return;
      }

      clicked  = e.target.closest('.modal-cancel-btn,.modal-close-btn');
      if (clicked) {
          e.preventDefault();
          this._closeModal();
          return;
      }

      clicked = e.target.closest('#modal-test-btn');
      if (clicked) {
          e.preventDefault();
          this._gatherConfig();
          return;
      }

 //     if (e.target.id === 'schedule-modal') {
 //         e.preventDefault();
 //         this._closeModal();
 //         return;
 //     }

      clicked = e.target.closest('#modal-submit-btn');
      if (clicked) {
          e.preventDefault();
          this._onCreateScheduleSubmit();
          return;
      }

      clicked = e.target.closest('#modal-sub-submit-btn');
      if (clicked) {
          e.preventDefault();
          this._onCreateSubScheduleSubmit();
          return;
      }

      clicked = e.target.closest('#modal-sub-link-submit-btn');
      if (clicked) {
          e.preventDefault();
          this._onCreateLinkedSubScheduleSubmit();
          return;
      }

      clicked = e.target.closest('#modal-delete-schedule-confirmed-btn');
      if (clicked) {
          e.preventDefault();
          this._onDeleteScheduleConfirm();
          return;
      }

  }

  _openNewScheduleModal() {
      const modal = this.shadowRoot.getElementById('schedule-modal');
      if (modal) {
          // Reset form fields
          this.shadowRoot.getElementById('schedule-name').value = '';
    //      this.shadowRoot.getElementById('schedule-icon').value = 'mdi:table-clock';
          
          modal.classList.add('open');
      }
  }

  _closeModal() {
      this.shadowRoot.querySelectorAll('.modal-overlay').forEach( mo => mo.classList.remove('open') );
  }

  _openNewLinkedSubScheduleModal() {
      const modal = this.shadowRoot.getElementById('linked-subschedule-modal');
      if (modal) {
          
          this._others = [];
          const scheduleConfig = this._isEditing ? this._gatherConfig() : this._allConfigs[ this._currentConfigId ];
          Object.keys( this._allConfigs ).forEach( k => {
              const entid = k.replace( this._domaindot, '');
              let sch;
              if (entid != scheduleConfig.id) {
                  sch = this._allConfigs[k];
                  const subs = Object.keys( sch.sub_schedules || {} );
                  if (subs.length !== 0) {
                      this._others.push( {entid: entid, subs: subs, name: sch.name} );
                  }
              }
          } );
          this._others.sort( (a, b) => a.name.localeCompare(b.name) );

          let els = [];
          let opt;
          let el = document.createElement( 'select' );
          el.id = 'link-source-sch-select';
          el.classList.add('ch');
          opt = document.createElement('option');
          opt.appendChild( document.createTextNode( '-- select source schedule --') );
          el.appendChild( opt );
          opt.selected = true; 

          this._others.forEach( oth => {
              opt = document.createElement('option');
              opt.appendChild( document.createTextNode( oth.name ));
              opt.value = oth.entid;
              el.appendChild(opt);
          } );

          els.push( el );

          this.shadowRoot.getElementById( 'source-ctr' ).replaceChildren( ...els );
          this.shadowRoot.getElementById( 'source-sub-ctr' ).replaceChildren();
          
          modal.classList.add('open');
      }
  }

  _openNewSubScheduleModal() {
      const modal = this.shadowRoot.getElementById('subschedule-modal');
      if (modal) {
          modal.classList.add('open');
      }
  }

  _openConfirmDeleteScheduleModal() {
      const modal = this.shadowRoot.getElementById('delete-schedule-confirm-modal');
      if (modal) {
          modal.classList.add('open');
      }
  }

  async _onDeleteScheduleConfirm() {
      let parms = {"type": this._domain + "/delete"};
      parms[ this._domain + "_id" ] = this._allConfigs[ this._currentConfigId ].id;
  //    parms[ "id" ] = this._currentConfigId;
      this._editing = false;
      this._currentConfigId = null;
      console.log('DELETED', parms);
      const returned = await this._hass.connection.sendMessagePromise(parms);
      this._fetchAllConfigs();
      this.render();
  }

  async _onCreateLinkedSubScheduleSubmit() {
      const nameInput = this.shadowRoot.getElementById('subschedule-linked-name');
      const name = nameInput ? this._validName( nameInput.value.trim() ) : '';

      let scheduleConfig = this._editing ? this._gatherConfig() : this._allConfigs[ this._currentConfigId ];
      let sub_schedules = scheduleConfig.sub_schedules;

      if (name.length === 0) {
          this.showToast('subschedule name must be nonblank, with alphanumerics and underlines only');
          return;
      }

      if ( Object.keys( sub_schedules ).indexOf(name) >= 0 ) {
          this.showToast('subschedule name must be unique within this schedule');
          return;
      }

      sub_schedules[ name ] = {link : this.shadowRoot.getElementById('link-source-sch-select').value
                              + '.' + this.shadowRoot.getElementById('link-source-sch-sub-select').value}
 
      console.log('linked subschedule', scheduleConfig);

      return; //////////

      this._editing = true;
      this._editingConfig = this._gatherConfig();
    //  let conf = this._editingConfig;
      this._editingConfig.sub_schedules[ name ] = {transitions: []}; // add the new sub-schedule

      this._closeModal();

      this.render();

  }

  async _onCreateSubScheduleSubmit() {
      const nameInput = this.shadowRoot.getElementById('subschedule-name');
      const name = nameInput ? this._validName( nameInput.value.trim() ) : '';

      let scheduleConfig = this._editing ? this._gatherConfig() : this._allConfigs[ this._currentConfigId ];
      let sub_schedules = scheduleConfig.sub_schedules;

      if (name.length === 0) {
          this.showToast('subschedule name must be nonblank, with alphanumerics and underlines only');
          return;
      }

      if ( Object.keys( sub_schedules ).indexOf(name) >= 0 ) {
          this.showToast('subschedule name must be unique within this schedule');
          return;
      }

      this._editing = true;
      this._editingConfig = this._gatherConfig();
    //  let conf = this._editingConfig;
      this._editingConfig.sub_schedules[ name ] = {transitions: []}; // add the new sub-schedule

      this._closeModal();

      this.render();

  }

  _validName( proposed ) {
      return proposed.replaceAll(/[^a-zA-Z0-9_]/g,'_');
  }

  _transToPc (trans, pc=100) {
      return (this._transToSecs(trans) / (24*60*60)) * pc;
  }

  _transToSecs( trans ) {
      try {
          const at = trans.at;
          return (((at.hh * 60) + at.mm) * 60) + at.ss;
      } catch(e) {console.log('trans', trans, 'e', e); return 0;}
  }

  _secsToAt( secs ) {
    const ss = secs % 60;
    let xx = (secs-ss) / 60;
    const mm = xx % 60;
    xx -= mm;
    return {hh: xx/60, mm: mm, ss: ss};
  }

  _isDummyName( name ) {
      return name ? name.startsWith( this._dummyBase ) : false;
  }

  _getDummyName() {
      return this._dummyBase + this._dummyExt++;
  }

  async _onCreateScheduleSubmit() {
      const nameInput = this.shadowRoot.getElementById('schedule-name');
      const name = nameInput ? nameInput.value.trim() : '';
      this._editing = false;
      
      if (!name) {
          this.showToast('Please enter a dynamic schedule name');
          return;
      }

      try {
          const parms = {
              type: this._domain + '/create',
              name: name,
              select_script: null,
              icon: 'mdi:table-clock',
//              icon: icon || 'mdi:table-clock',
              "boolean" : false
//              "boolean" : Boolean( bool ),
 //             ...updatedConfig
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
          console.log( 'returned', returned );

          this.showToast(`${this._name} "${name}" created successfully`);
          this._closeModal();
          this._fetchAllConfigs();
          this._currentConfigId = this._domaindot + returned.id;
          this.render()
      } catch (err) {
          console.error(`Failed to create ${this._name}.`, err);
          this.showToast(`Failed to create ${this._name}: ${err.message || 'Unknown error'}`);
      }
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    // Initial fetch of detailed blocks if possible
    if (this._hass && !this._hasFetchedConfigs) {
        this._hasFetchedConfigs = true;
        this._fetchAllConfigs();
        this._fetchScriptConfigs();
    } else if (this._hass && this._hasFetchedConfigs && oldHass) {
        // Detect if any schedule states changed (e.g. user edited a schedule in the dialog)
        const oldSchedules = Object.values(oldHass.states).filter(state => state.entity_id.startsWith( this._domaindot));
        const newSchedules = Object.values(this._hass.states).filter(state => state.entity_id.startsWith( this._domaindot));
        
        // If the state objects differ (like last_updated changed), re-fetch the details
        if (JSON.stringify(oldSchedules) !== JSON.stringify(newSchedules)) {
            this._fetchAllConfigs();
        }

        // Detect if any script states changed or populated
        const oldScripts = Object.values(oldHass.states).filter(state => state.entity_id.startsWith('script.'));
        const newScripts = Object.values(this._hass.states).filter(state => state.entity_id.startsWith('script.'));
        
        if (JSON.stringify(oldScripts) !== JSON.stringify(newScripts)) {
            this._fetchScriptConfigs();
        }

    }

  }

  async _fetchScriptConfigs() {
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
          console.error("[Schedule Panel Debug] Global error in _fetchScriptConfigss:", err);
      }

      console.log('_eligibleScriptConfigs', this._eligibleScriptConfigs);
      this.render();
  }

  async _fetchAllConfigs() {
      let response = null;
      try {
          response = await this._hass.connection.sendMessagePromise({
            type: 'call_service',
            domain: this._domain,
            service: 'get_schedule',
            target: { entity_id: 'all' },
            return_response: true
          });
      } catch(e) {
          console.log('oops', e);
      }

      this._allConfigs = (response && response.response) ? response.response : {};

      Object.entries( this._allConfigs ).forEach( ([k, v]) => {
          v["_editable"] = (this._hass.states[ k ].attributes || {})["editable"] || false;
      });

      let orderedIds = Object.keys( this._allConfigs )
          .sort( (a, b) => this._allConfigs[a].name.localeCompare( this._allConfigs[b].name ) )

      let do_render = false;
      if (orderedIds.toString() !== this._orderedIds.toString()) {
          console.log('orderedIds changed', this._orderedIds, orderedIds );
          this._orderedIds = orderedIds;
          do_render = true;
      }

      if ( !this._currentConfigId    &&    this._orderedIds ) {
          do_render = true;
      }

      if (do_render) {
          this.render();
      }

      console.log('allConfigs', this._allConfigs );

  }

  _gatherConfig() {
      // generate a proposed config, from the contents of the screen:

      let val;
      let conf = {_editable: true};
      conf.name = this.shadowRoot.querySelector("#schedule-name-input").value.trim();
      conf["boolean"] = this.shadowRoot.querySelector("#schedule-is-boolean").checked;
      conf.select_script = this.shadowRoot.querySelector("#schedule-script-selector").value || null;
      conf.icon = this.shadowRoot.querySelector("#schedule-icon").value || null;
      val = this.shadowRoot.querySelector("#schedule-uom").value || null;
      if (val) conf.unit_of_measurement = val;
      conf.delay_startup = Number( this.shadowRoot.querySelector("#schedule-delay").value || 0 );
      val = this.shadowRoot.querySelector("#schedule-dc").value || null;
      if (val) conf.device_class = val;

      // subschedules:
      let subs = {};
      [...this.shadowRoot.querySelectorAll('.sh-name')].map( sh => sh.dataset.sub ).map((sub, inx) => {
          this.shadowRoot.querySelectorAll( ".subschedule-" + inx.toString() ).forEach( schctr => {
              let transs = [];
              schctr.querySelectorAll(".trans").forEach( trans => {
                  let at = {};
                  at.hh = Number( trans.querySelector('.hh').value );
                  at.mm = Number( trans.querySelector('.mm').value );
                  at.ss = Number( trans.querySelector('.ss').value );
                  let t = {at : at};
                  if (conf.boolean) {
                      t.state = Boolean( trans.querySelector('.state').checked );
                  } else {
                      const state = trans.querySelector('.state').value;
                      t.state = Number.isNaN(state) ? state : Number(state);
                  }
                  transs.push( t );
              });
              subs[ sub ] = {transitions : transs.sort( (a,b) => this._transToSecs(a) > this._transToSecs(b) )}
          } );
      });
      conf.sub_schedules = subs;

      // attributes:
      let inxs = {}; // key=index; value = {'k' : attrname, 'v' : attrvalue}

      this.shadowRoot.querySelectorAll( ".attrname" ).forEach( attrn => {
          inxs[  attrn.dataset.inx ] = {k : this._validName( attrn.value.trim() ) || this._getDummyName() }
      });

      this.shadowRoot.querySelectorAll( ".attrvalue" ).forEach( attrv => {
          inxs[ attrv.dataset.inx ].v = attrv.value.split("\n")
                     .filter( vv => vv.length > 0 );
      });

      let attrs = {}
      Object.values( inxs )
          .sort( (a,b) => a.k.localeCompare(b.k) )
          .forEach( kv => attrs[ kv.k ] = kv.v);
      conf.attributes = attrs;

      conf[ this._domain + '_id' ] = this.shadowRoot.querySelector("#schedule-sel-entid")
          .value
          .replace(this._domaindot, '');
      conf.type = this._domain + '/update';

      return conf;
  }

  render() {

    let schedselHtml = '';
    let scriptselHtml = '';
    let allContentHtml = '';
    let deleteScheduleHtml = '';
    let boolHtml = '';
    let attrHtml = '';
    let subsched_names = [];
    let subscheds = {};
    let timeGutterHeaderHtml = '';
    let scheduleConfig = null;
    let rw = false;
    let selected = false;
    let attribs = {};
    let attribs_names = [];
    let schedName = '';

    if (this._orderedIds.length > 0) {

        if (this._currentConfigId === null) {
            this._currentConfigId = this._orderedIds[0];
        }

        scheduleConfig = this._editing ? this._editingConfig : this._allConfigs[ this._currentConfigId ];
        if ( ! scheduleConfig ) {
            console.log( 'no scheduleConfig : not rendering' );
            return;
        }

        rw = scheduleConfig._editable;
        schedName = scheduleConfig.name;

        schedselHtml += `<select class="icon-btn" id="schedule-sel-entid">`
        this._orderedIds.forEach( eid => {
            schedselHtml += `<option ${eid === this._currentConfigId ? "selected " : ""}value="${eid}">${this._allConfigs[eid].name}</option>`;
        } );
        schedselHtml += `</select>`;

        //

        scriptselHtml += `<select ${rw?"" : "disabled "}class="icon-btn ch" id="schedule-script-selector">`;

        selected = false;
        const long_scriptids = this._eligibleScriptConfigs.map( scr => scr.id);
        const short_scriptids = long_scriptids.map( scr => scr.replace("script.",""));
        selected = ((! long_scriptids.includes( scheduleConfig.select_script ))
                &&
                 (! short_scriptids.includes( scheduleConfig.select_script )) );

        scriptselHtml += `<option ${selected ? "selected " : ""}value="">-- none --</option>`;

        this._eligibleScriptConfigs.forEach( cnf => {
            selected = false;
            if (this._eligibleScriptConfigs.length === 1) {
                selected = true;
            } else if (
                (scheduleConfig.select_script == cnf.id.replace("script.",""))
                    ||
                (scheduleConfig.select_script == cnf.id)) {
                selected = true;
            }

            scriptselHtml += `<option ${selected  ? "selected " : ""}value="${cnf.id.replace('script.','')}">${cnf.alias}</option>`;
        });

        scriptselHtml += '</select>';

      //

        boolHtml = `<ha-switch ${rw ? "" : "disabled "}${scheduleConfig.boolean ? "checked " : ""} id="schedule-is-boolean" class="ch"></ha-switch>`;

        subscheds = scheduleConfig ? scheduleConfig.sub_schedules : {};
        subsched_names = Object.keys(subscheds).sort((a,b) => a.localeCompare(b));
        attribs = (scheduleConfig && scheduleConfig.attributes) ? scheduleConfig.attributes : {}; 
        attribs_names = Object.keys(attribs).sort((a,b) => a.localeCompare(b));

    // subschedule columns
        let subschedHtml = '';

        // time gutter header 
        // 1) add a subschedule
        if (rw) {
            timeGutterHeaderHtml += `
          <span class="fll"><button id="add-subschedule" class="icon-btn" title="add a subschedule">
                  <ha-icon icon="mdi:plus"></ha-icon>
          </button></span>
        `;

            let got_others = false;
      //      const scheduleConfig = this._isEditing ? this._gatherConfig() : this._scheduleConfigs[ this._domaindot + this._activeScheduleOverview.entid ];
            Object.keys( this._allConfigs ).forEach( k => {
                const entid = k.replace( this._domaindot, '');
                if (entid != scheduleConfig.id) {
                    if (Object.keys( this._allConfigs[k].sub_schedules || {} ).length > 0) {
                        got_others = true;
                    }
                }
            });

            if (got_others) {
                timeGutterHeaderHtml += `
              <span class="fll"><button id="link-subschedule" class="icon-btn" title="link to a subschedule of another schedule">
                  <ha-icon icon="mdi:link"></ha-icon>
              </button></span>
            `;
            }

        }

    // Time Gutter (Y-Axis)
        const timeGutterHtml = `
        <div class="time-gutter">
            ${Array.from({length: 24}).map((_, i) => `
                <div class="time-slot"><span>${i.toString().padStart(2, '0')}:00</span></div>
            `).join('')}
        </div>
        `;

        let subschedNamesHtml = subsched_names.map((sub, inx) => `
            <div class="sub-header sh-name" data-sub="${sub}" data-inx=${inx}>
                <div class="subh">
         ${rw ? `<span><button class="icon-btn delete-subschedule" title="remove this entire &quot;${sub}&quot; sub-schedule">
              <ha-icon icon="mdi:delete-forever"></ha-icon>
                </button></span>` : ''}
                <span>${sub}</span>
         ${rw ? `<span><button class="icon-btn add-transition" title="add a transition to this &quot;${sub}&quot; sub-schedule">
              <ha-icon icon="mdi:plus"></ha-icon>
         </button></span>` : ''}
        </div>
      </div>
        `).join('');

        subschedNamesHtml = `
      <div class="sub-hrows">
       ${subschedNamesHtml}
      </div>
      `;

        let subschedTransitionsHtml = subsched_names.map( (sub, inx) => {
            let cont = `<div class="sub-header subschedule-${inx}" style="contain: content; overflow: visible; position: relatve;">`;
            let subsched = scheduleConfig.sub_schedules[ sub ];
            let lastpc = 0;
            let desiredpc;
            let st;
            let hl;
            subsched.transitions.map( (trans, tinx) => {
                desiredpc = this._transToPc(trans, 97);
                st = trans.state;

                if (tinx) {
                    desiredpc = Math.max( desiredpc, lastpc + 3.5 );  // was 4
                }

                if (st === null) {
                    hl = " hilite";
                    st = 0;
                } else {
                    hl = "";
                }

                cont += `<div class="trans${hl}" data-inx=${tinx} data-sub="${sub}"style="position:absolute;top:${desiredpc}%;">`;
                if (rw) {
                    cont += `<span>hh:<input class="hh ch" type=number min=0 max=23 value=${trans.at.hh}></input>`;
                    cont += `<span>mm:<input class="mm ch" type=number min=0 max=59 value=${trans.at.mm}></input>`;
                    cont += `<span>ss:<input class="ss ch" type=number min=0 max=59 value=${trans.at.ss}></input>`;
                    cont += '<span> state';
                    cont += scheduleConfig["boolean"]
                    ? `<ha-switch class="state ch" ${!!st ? "checked " : ""}></ha-switch>`
                    : `<input class="state ch" type="text" value="${st}" size="5" style="field-sizing:content;"></input>`;
                    cont += '</span>';
                    cont += `<ha-icon class="rm-trans" icon="mdi:delete-forever" title="delete transition"></ha-icon>`;
                } else {
                    cont += `<span>${trans.at.hh}:${trans.at.mm.toString().padStart(2, '0')}:${trans.at.ss.toString().padStart(2, '0')}</span>`;
                    cont += '<span> state ';
                    cont += scheduleConfig["boolean"] 
                    ? `<ha-switch disabled ${!!st ? "checked " : ""}></ha-switch>`
                    : `${st}`;
                    cont += '</span>'
                }
                cont += `</div>`;
                lastpc = desiredpc;
            });
            cont += '</div>';
            return cont;
        }).join('');

        subschedTransitionsHtml = `
      <div class="sub-transitions">
       ${subschedTransitionsHtml}
      </div>
      `;

 //             >${attribs[attrname].join("&#10;")}</textarea>

        if (attribs_names.length || rw) {
            attrHtml = attribs_names.map((attrname, inx) => {
            let atname = this._isDummyName(attrname) ? '' : attrname;
            return `
           <div>
             <input ${rw ? "" : "readonly "}id="attr-name-${inx}" data-inx=${inx} type="text" class="ch attrname" value="${atname}">
           </div>
           <div>
             <textarea class="ch attrvalue" data-inx=${inx} ${rw ? "" : "disabled "}id="attr-value-${inx}"
              >${attribs[attrname].join("\n")}</textarea>
           </div>
            `}).join('');

            if (attrHtml) {
                attrHtml = '<div>Name</div><div>Value</div>' + attrHtml;
            }
        } 

        if (rw) {
            deleteScheduleHtml = `
              <button class="icon-btn" id="delete-schedule-btn" title="Delete ${this._name}" style="padding-left: 12px; padding-right: 12px; gap: 8px;">
                  <ha-svg-icon icon="mdi:delete-forever" style="color:rgb(220, 49, 70);"></ha-svg-icon>Delete ${this._name}
              </button>`
        }

        allContentHtml = `
      <div class="content">
        <ha-card>
         <div class="attrs-ctr">
          <div class="attr-name">
           <label style="width: 100%" for="schedule-name-input">Name</label>
          </div>
          <div class="attr-value">
           <input ${rw ? "" : "readonly "}id="schedule-name-input" type="text" class="ch" value="${scheduleConfig ? scheduleConfig.name : ''}">
          </div>
          <div class="attr-name">Binary</div>
          <div class="attr-value">
           ${boolHtml}
          </div>
          <div class="attr-name">Selector script</div>
          <div class="attr-value">
           ${scriptselHtml}
          </div>
          <div class="attr-name">Icon</div>
          <div class="attr-value">
           <ha-icon-picker
            id="schedule-icon"
            class="ch"
            ${rw?"":"disabled "} 
            value="${ (scheduleConfig && scheduleConfig.icon) ? scheduleConfig.icon:'mdi:table-clock'}"
           ></ha-icon-picker>
          </div>
          <div class="attr-name">Unit of  measurement</div>
          <div class="attr-value">
           <input placeholder="optional" ${rw ? "" : "readonly "}id="schedule-uom" type="text" class="ch" value="${(scheduleConfig && scheduleConfig.unit_of_measurement) ? scheduleConfig.unit_of_measurement : ''}">
          </div>

          <div class="attr-name">Device class</div>
          <div class="attr-value">
           <input placeholder="optional" ${rw ? "" : "readonly "}id="schedule-dc" type="text" class="ch" value="${(scheduleConfig && scheduleConfig.device_class) ? scheduleConfig.device_class : ''}">
          </div>

          <div class="attr-name">Delay startup</div>
          <div class="attr-value">
           <input ${rw ? "" : "readonly "}id="schedule-delay" type="number" class="ch" value="${(scheduleConfig && scheduleConfig.delay_startup) ? scheduleConfig.delay_startup : 0}">
          </div>

          ${(attrHtml.length || rw) ? `
          <div class="attr-name subh">
          Attributes
          ${rw ? '<button id="add-attribute" class="icon-btn" title="add an attribute">+</button>' : ""}
          </div>
          <div class="attr-value">
           <div class="attrs-ctr">
           ${attrHtml}
           </div>
          </div>` : ''}

         </div>
        </ha-card>
        <!--
        <div class="save-container">
        <ha-button slot="fab" id="save-button" size="l"  variant="brand" appearance="accent">Save <ha-icon slot="start" icon="mdi:content-save"></ha-icon></ha-button>
        </div>
        <div id=fabp class="afab-positioner">
        <ha-button slot="fab" id="save-button" size="l"  variant="brand" appearance="accent">Save <ha-icon slot="start" icon="mdi:content-save"></ha-icon></ha-button>
        </div>
        -->
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
      </div>
      `;

    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --Xmdc-icon-size: 16px;
          --mdc-icon-size: 20px;
          display: block;
          XXpadding: 24px;
          padding: 16px;
          background-color: var(--primary-background-color);
          color: var(--primary-text-color);
       /*   font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); */
          font-family: var(--paper-font-body1_-_font-family), Roboto, sans-serif;
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

.bord {
   outline:1px blue solid;
   padding: 2px;
   margin: 2px;
 }

        * {
            box-sizing: border-box;
        }

        .fll {
            flex: 1;
        }

        .trans {
            display: flex
            align-items: center;
            width: max-content;
            border-radius: 4px;
            padding-left, padding-right: 3px;
        }

        .hilite {
            border: 2px solid red;
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
            padding: 6px;
            border-radius: 6px;
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
            display: flex;
        }

        .time-slot {
            height: 30px;
            position: relative;
        }

        .time-slot-half {
            height: 30px;
            position: relative;
            border: 1px solid green;
        }

        .time-slot span {
            position: absolute;
            top: -8px;
            right: 8px;
            font-size: 12px;
            color: var(--secondary-text-color);
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

        .attrs-ctr {
            display: grid;
            grid-template-columns: min-content auto;
            padding: 4px;
        }

        .attr-name {
            display: flex;
       /*     justify-content: center; */
            align-items: center;
            white-space: nowrap;
            padding: 4px;   
        }

        .attr-value {
            padding: 2px;
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

        .subh {
            display: flex;
        /*    justify-content: space-around; */
            justify-content: space-between;
            width: 100%;
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

        /* Save button */
        .save-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            pointer-events: none;
        }

        .save-container.open {
            opacity: 1;
            pointer-events: auto;
        }

        .save-container ha-button[slot="fab"] {
            position: fixed;
            right: unset;
            left: unset;
            bXXottom: calc(-80px - var(--safe-area-inset-bottom));
            bottom: calc(80px - var(--safe-area-inset-bottom));
            transition: bottom 0.3s;
        }

        .save-container ha-button[slot="fab"].dirty {
            bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
        }

        .clean {
         /*   opacity: 0.5; */
            display: none;
        }

        .dirty {
            opacity: 1;
            background-color: red;
            font-weight: bold;
            color: white;
            display: block;
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

  .afab-positioner {
    position: absolute;
    display: block;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
  }

  .afab-positionerX {
    display: flex;
    justify-content: flex-end;
  }

  .afab-positioner ha-button[slot="fab"] {
    position: fixed;
    right: unset;
    left: unset;
    bXXottom: calc(-80px - var(--safe-area-inset-bottom));
    bottom: calc(80px - var(--safe-area-inset-bottom));
    transition: bottom 0.3s;
  }

  .afab-positioner ha-button[slot="fab"].dirty {
    bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
  }

      </style>

      <div class="header">
          <div class="title">
              <ha-icon icon="mdi:table-clock"></ha-icon>
              ${this._name}s
          </div>
          <div class="zoom-controls">
        <!--      <button class="icon-btn" id="main-test-btn" title="test">test</button> -->
              <button class="icon-btn ${this._isEditing?'dirty':'clean'}" id="save-btn" title="save">save</button>
              ${deleteScheduleHtml}
              ${schedselHtml}
              <button class="icon-btn" id="new-schedule-btn" title="New Schedule" style="padding-left: 12px; padding-right: 12px; gap: 8px;">
                  <ha-icon icon="mdi:plus"></ha-icon> New ${this._name}
              </button>
          </div>
      </div>

      ${allContentHtml}


      <div id="schedule-modal" class="modal-overlay">
          <div class="modal-content">
          <demo-components-ha-dialog></demo-components-ha-dialog>
              <div class="modal-header">
                  <h2>Create New ${this._name}</h2>
                  <button class="close-btn modal-close-btn">&times;</button>
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
                  <div class="modal-footer">
               <!--       <button type="button" class="btn secondary" id="modal-test-btn">Test</button> -->
                      <button type="button" class="btn secondary modal-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-submit-btn">Create ${this._name}</button>
                  </div>
              </form>
          </div>
      </div>


      <div id="subschedule-modal" class="modal-overlay">
          <div class="modal-content">
              <div class="modal-header">
                  <h2>Create New Sub-schedule</h2>
                  <button class="close-btn modal-close-btn">&times;</button>
              </div>
              <form id="schedule-form" onsubmit="return false;">
                  <div class="form-group">
                      <div id="ssname">
                          <div>Sub-schedule name</div>
                          <ha-input
                            placeholder="alphanumerics or underlines"
                            id="subschedule-name"
                          >
                          </ha-input>
                      </div>
                  </div>
                  <div class="modal-footer">
           <!--           <button type="button" class="btn secondary" id="modal-sub-test-btn">Test</button>  -->
                      <button type="button" class="btn secondary modal-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-sub-submit-btn">Create Sub-schedule</button>
                  </div>
              </form>
          </div>
      </div>

      <div id="linked-subschedule-modal" class="modal-overlay">
          <div class="modal-content">
              <div class="modal-header">
                  <h2>Create New Linked Sub-schedule</h2>
                  <button class="close-btn modal-close-btn">&times;</button>
              </div>
              <form id="schedule-form" onsubmit="return false;">
                  <div class="form-group">
                      <div id="ssource">
                          <div>Source</div>
                          <div id="source-ctr"></div>
                          <div id="source-sub-ctr"></div>
                      </div>
                      <div id="ssname">
                          <div>Sub-schedule name</div>
                          <ha-input
                            placeholder="alphanumerics or underlines"
                            id="subschedule-linked-name"
                          >
                          </ha-input>
                      </div>
                  </div>
                  <div class="modal-footer">
                      <button type="button" class="btn secondary modal-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-sub-link-submit-btn">Link Sub-schedule</button>
                  </div>
              </form>
          </div>
      </div>

      <div id="delete-schedule-confirm-modal" class="modal-overlay">
          <div class="modal-content">
              <div class="modal-header">
                  <h2>Confirm Deletion of <b>${schedName}</b></h2>
                  <button class="close-btn modal-close-btn">&times;</button>
              </div>
              <div>This will delete the <b>${schedName}</b> ${this._name}</div>
                  <div class="modal-footer">
                      <button type="button" class="btn secondary modal-cancel-btn">Cancel</button>
                      <button type="submit" class="btn primary" id="modal-delete-schedule-confirmed-btn">Delete ${schedName}</button>
                  </div>
          </div>
      </div>

      `;
    }

}

if (!customElements.get('dynamic-schedule-panel')) {
    customElements.define('dynamic-schedule-panel', DynamicSchedulePanel);
}

