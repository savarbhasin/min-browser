const webviews = require('webviews.js')

const API_URL = 'http://192.168.2.235:8000/api/reports';

const reportFeedback = {
    initialize: function () {
        if (document.getElementById('report-sidebar')) {
            return;
        }

        const sidebar = document.createElement('div');
        sidebar.id = 'report-sidebar';
        sidebar.hidden = true;
        sidebar.innerHTML = `
      <div id="report-header">
        <div class="header-title">Report Feedback</div>
        <span id="report-close">&times;</span>
      </div>
      <div id="report-content">
        <div class="report-form-group">
          <label for="report-url">URL</label>
          <input type="text" id="report-url" readonly>
        </div>
        <div class="report-form-group">
          <label for="report-type">Report Type</label>
          <select id="report-type">
            <option value="true_positive">True Positive (Confirmed Phishing)</option>
            <option value="false_positive">False Positive (Safe site marked as Phishing)</option>
            <option value="false_negative">False Negative (Phishing site marked as Safe)</option>
            <option value="other">Other Issue</option>
          </select>
        </div>
        <div class="report-form-group">
          <label for="report-description">Description</label>
          <textarea id="report-description" rows="6" placeholder="Please describe the issue in detail..."></textarea>
        </div>
        <div class="report-form-actions">
          <button id="report-submit" class="primary">Submit Report</button>
          <button id="report-cancel">Cancel</button>
        </div>
        <div id="report-status"></div>
      </div>
    `;

        document.body.appendChild(sidebar);

        document.getElementById('report-close').addEventListener('click', () => {
            this.toggle();
        });

        document.getElementById('report-cancel').addEventListener('click', () => {
            this.toggle();
        });

        document.getElementById('report-submit').addEventListener('click', () => {
            this.submit();
        });

        // Listen for IPC event from menu
        ipc.on('showReportFeedback', () => {
            this.show();
        });
    },

    toggle: function () {
        const sidebar = document.getElementById('report-sidebar');
        if (sidebar.hidden) {
            sidebar.hidden = false;
            webviews.adjustMargin([0, 400, 0, 0]);
            this.updateURL();
            setTimeout(() => document.getElementById('report-description').focus(), 100);
        } else {
            sidebar.hidden = true;
            webviews.adjustMargin([0, -400, 0, 0]);
            this.clearForm();
        }
    },

    show: function () {
        const sidebar = document.getElementById('report-sidebar');
        if (sidebar.hidden) {
            this.toggle();
        }
    },

    updateURL: function () {
        const urlInput = document.getElementById('report-url');
        if (urlInput) {
            try {
                if (window.tabs && tabs.getSelected) {
                    const currentTab = tabs.get(tabs.getSelected());
                    urlInput.value = currentTab ? currentTab.url : '';
                } else {
                    urlInput.value = '';
                }
            } catch (error) {
                console.error('Error getting current tab:', error);
                urlInput.value = '';
            }
        }
    },

    clearForm: function () {
        document.getElementById('report-description').value = '';
        document.getElementById('report-type').selectedIndex = 0;
        document.getElementById('report-status').innerHTML = '';
    },

    submit: async function () {
        const url = document.getElementById('report-url').value;
        const type = document.getElementById('report-type').value;
        const description = document.getElementById('report-description').value.trim();
        const statusDiv = document.getElementById('report-status');

        // Validation
        if (!url) {
            statusDiv.innerHTML = '<div class="status-error">No URL to report. Please navigate to a website first.</div>';
            return;
        }

        if (!description) {
            statusDiv.innerHTML = '<div class="status-error">Please provide a description.</div>';
            return;
        }

        // Show loading
        statusDiv.innerHTML = '<div class="status-loading">Submitting report...</div>';
        document.getElementById('report-submit').disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: url,
                    type: type,
                    description: description,
                    timestamp: new Date().toISOString()
                })
            });

            if (response.ok) {
                statusDiv.innerHTML = '<div class="status-success">✓ Report submitted successfully!</div>';
                setTimeout(() => {
                    this.toggle();
                }, 2000);
            } else {
                const errorData = await response.json().catch(() => ({}));
                statusDiv.innerHTML = `<div class="status-error">Failed to submit report: ${errorData.message || response.statusText}</div>`;
            }
        } catch (error) {
            console.error('Report API Error:', error);
            statusDiv.innerHTML = '<div class="status-error">Error connecting to server. Please check your connection.</div>';
        } finally {
            document.getElementById('report-submit').disabled = false;
        }
    }
};

module.exports = reportFeedback;
