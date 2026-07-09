(function () {
  'use strict';
  var BACKEND_URL = '__BACKEND_URL__';
  var formCache = {};
  var currentFormId = null;
  var host = null;
  var shadowRoot = null;

  var CHEVRON_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E";

  var CSS_TEMPLATE =
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');" +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:"Inter",Arial,sans-serif;margin:0;padding:0}' +
    '#bb-form-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);' +
    '-webkit-backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;' +
    'padding:16px}' +
    '#bb-form-modal{background:#fff;border-radius:20px;width:100%;max-width:480px;max-height:90vh;' +
    'overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,.15);animation:bb-modal-in .3s cubic-bezier(0.34,1.56,0.64,1)}' +
    '@keyframes bb-modal-in{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}' +
    '#bb-form-header{padding:24px 24px 0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}' +
    '#bb-form-name{font-weight:700;font-size:20px;color:#111827}' +
    '#bb-form-desc{font-size:14px;color:#6b7280;margin-top:4px}' +
    '#bb-form-close{width:32px;height:32px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}' +
    '#bb-form-close:hover{background:#e5e7eb}' +
    '#bb-form-body{padding:20px 24px}' +
    '.bb-field{margin-bottom:16px}' +
    '.bb-field label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}' +
    '.bb-required{color:#ef4444;margin-left:2px}' +
    '.bb-field input,.bb-field select{width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;' +
    'font-size:14px;color:#111827;font-family:"Inter",Arial,sans-serif;outline:none;transition:border-color .15s;' +
    'background:#fff}' +
    '.bb-field input:focus,.bb-field select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.1)}' +
    '.bb-field input.bb-error-input,.bb-field select.bb-error-input{border-color:#ef4444}' +
    '.bb-field select{appearance:none;-webkit-appearance:none;background-image:url("' +
    CHEVRON_SVG +
    '");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;cursor:pointer}' +
    '.bb-field-error{font-size:12px;color:#ef4444;margin-top:4px;display:none}' +
    '.bb-field-error.bb-visible{display:block}' +
    '#bb-form-footer{padding:0 24px 24px;margin-top:8px}' +
    '#bb-form-submit{width:100%;padding:13px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;' +
    'border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;' +
    'font-family:"Inter",Arial,sans-serif;transition:opacity .15s,transform .1s;display:flex;' +
    'align-items:center;justify-content:center;gap:8px}' +
    '#bb-form-submit:hover{opacity:.92}' +
    '#bb-form-submit:active{transform:scale(.99)}' +
    '#bb-form-submit:disabled{opacity:.7;cursor:default}' +
    '#bb-submit-error{font-size:13px;color:#ef4444;margin-top:10px;text-align:center;display:none}' +
    '#bb-submit-error.bb-visible{display:block}' +
    '.bb-spinner{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.4);' +
    'border-top-color:#fff;animation:bb-spin .7s linear infinite}' +
    '@keyframes bb-spin{to{transform:rotate(360deg)}}' +
    '#bb-form-success{text-align:center;padding:40px}' +
    '#bb-success-check{width:64px;height:64px;background:#d1fae5;border-radius:50%;display:flex;' +
    'align-items:center;justify-content:center;margin:0 auto}' +
    '#bb-success-title{font-weight:700;font-size:22px;color:#111827;margin-top:16px}' +
    '#bb-success-sub{font-size:14px;color:#6b7280;margin-top:8px}' +
    '#bb-success-close{margin-top:24px;padding:10px 24px;background:transparent;border:1.5px solid #6366f1;' +
    'color:#6366f1;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;' +
    'font-family:"Inter",Arial,sans-serif;transition:background .15s}' +
    '#bb-success-close:hover{background:rgba(99,102,241,.06)}' +
    '@media (max-width:480px){#bb-form-modal{max-width:100%;border-radius:16px}' +
    '#bb-form-header{padding:20px 20px 0}#bb-form-body{padding:16px 20px}#bb-form-footer{padding:0 20px 20px}}';

  var CLOSE_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="18" y1="6" x2="6" y2="18" stroke="#6b7280" stroke-width="2" stroke-linecap="round"/>' +
    '<line x1="6" y1="6" x2="18" y2="18" stroke="#6b7280" stroke-width="2" stroke-linecap="round"/></svg>';

  var CHECK_ICON =
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M20 6L9 17l-5-5" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function loadForm(formId, callback) {
    if (formCache[formId]) {
      callback(formCache[formId]);
      return;
    }
    fetch(BACKEND_URL + '/api/forms/public/' + encodeURIComponent(formId))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success || !res.data) return;
        formCache[formId] = res.data;
        callback(res.data);
      })
      .catch(function () {
        /* exit silently, never break the host site */
      });
  }

  function ensureShadowRoot() {
    if (shadowRoot) return;
    host = document.createElement('div');
    host.id = 'beepboop-form-widget-host';
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS_TEMPLATE;
    shadowRoot.appendChild(style);
  }

  function fieldInputHtml(field) {
    var requiredAttr = field.required ? ' data-required="true"' : '';
    if (field.type === 'options') {
      var optionsHtml = '<option value="" disabled selected>Select an option</option>';
      var options = field.options || [];
      for (var i = 0; i < options.length; i++) {
        optionsHtml += '<option value="' + escapeHtml(options[i]) + '">' + escapeHtml(options[i]) + '</option>';
      }
      return (
        '<select id="bb-input-' + field.fieldId + '" data-field-id="' + field.fieldId + '"' + requiredAttr + '>' +
        optionsHtml +
        '</select>'
      );
    }
    var inputType = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text';
    return (
      '<input id="bb-input-' + field.fieldId + '" data-field-id="' + field.fieldId + '" type="' + inputType + '"' +
      (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') +
      requiredAttr +
      ' />'
    );
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function buildFieldsHtml(fields) {
    var html = '';
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      html +=
        '<div class="bb-field">' +
        '<label for="bb-input-' + field.fieldId + '">' +
        escapeHtml(field.label) +
        (field.required ? '<span class="bb-required">*</span>' : '') +
        '</label>' +
        fieldInputHtml(field) +
        '<div class="bb-field-error" id="bb-error-' + field.fieldId + '">This field is required</div>' +
        '</div>';
    }
    return html;
  }

  function mountModal(config) {
    ensureShadowRoot();

    var existing = shadowRoot.getElementById('bb-form-backdrop');
    if (existing) existing.remove();

    var backdrop = document.createElement('div');
    backdrop.id = 'bb-form-backdrop';
    backdrop.innerHTML =
      '<div id="bb-form-modal">' +
      '<div id="bb-form-header">' +
      '<div>' +
      '<div id="bb-form-name">' + escapeHtml(config.name) + '</div>' +
      (config.description ? '<div id="bb-form-desc">' + escapeHtml(config.description) + '</div>' : '') +
      '</div>' +
      '<button id="bb-form-close" aria-label="Close form">' + CLOSE_ICON + '</button>' +
      '</div>' +
      '<div id="bb-form-body">' + buildFieldsHtml(config.fields) + '</div>' +
      '<div id="bb-form-footer">' +
      '<button id="bb-form-submit">' + escapeHtml(config.submitButtonText || 'Submit') + '</button>' +
      '<div id="bb-submit-error">Something went wrong. Please try again.</div>' +
      '</div>' +
      '</div>';

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeForm();
    });

    shadowRoot.appendChild(backdrop);

    var closeBtn = shadowRoot.getElementById('bb-form-close');
    closeBtn.addEventListener('click', closeForm);

    var submitBtn = shadowRoot.getElementById('bb-form-submit');
    submitBtn.addEventListener('click', function () {
      handleSubmit(config);
    });
  }

  function validateFields(fields) {
    var isValid = true;
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var input = shadowRoot.getElementById('bb-input-' + field.fieldId);
      var errorEl = shadowRoot.getElementById('bb-error-' + field.fieldId);
      var value = input ? input.value.trim() : '';

      if (field.required && !value) {
        isValid = false;
        if (input) input.classList.add('bb-error-input');
        if (errorEl) errorEl.classList.add('bb-visible');
      } else {
        if (input) input.classList.remove('bb-error-input');
        if (errorEl) errorEl.classList.remove('bb-visible');
      }
    }
    return isValid;
  }

  function handleSubmit(config) {
    var submitErrorEl = shadowRoot.getElementById('bb-submit-error');
    submitErrorEl.classList.remove('bb-visible');

    if (!validateFields(config.fields)) return;

    var customFields = {};
    for (var i = 0; i < config.fields.length; i++) {
      var field = config.fields[i];
      var input = shadowRoot.getElementById('bb-input-' + field.fieldId);
      customFields[field.fieldId] = input ? input.value.trim() : '';
    }

    var submitBtn = shadowRoot.getElementById('bb-form-submit');
    var originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="bb-spinner"></span>Submitting...';

    fetch(BACKEND_URL + '/api/forms/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formId: currentFormId,
        customFields: customFields,
        sourceUrl: window.location.href
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success) throw new Error('submit failed');
        showSuccess();
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        submitErrorEl.classList.add('bb-visible');
      });
  }

  function showSuccess() {
    var modal = shadowRoot.getElementById('bb-form-modal');
    if (!modal) return;
    modal.innerHTML =
      '<div id="bb-form-success">' +
      '<div id="bb-success-check">' + CHECK_ICON + '</div>' +
      '<div id="bb-success-title">Thank you!</div>' +
      '<div id="bb-success-sub">We\'ll be in touch soon.</div>' +
      '<button id="bb-success-close">Close</button>' +
      '</div>';
    var closeBtn = shadowRoot.getElementById('bb-success-close');
    closeBtn.addEventListener('click', closeForm);
  }

  function closeForm() {
    if (!shadowRoot) return;
    var backdrop = shadowRoot.getElementById('bb-form-backdrop');
    if (backdrop) backdrop.remove();
  }

  window.BeepBoop = window.BeepBoop || {};

  window.BeepBoop.openForm = function (formId) {
    currentFormId = formId;
    loadForm(formId, function (config) {
      mountModal(config);
    });
  };

  window.BeepBoop.closeForm = function () {
    closeForm();
  };
})();
