const webviews = require('webviews.js')

const API_URL = 'http://localhost:8000/api/reports/';

const reportFeedback = {
    initialize: function () {
        ipc.on('showReportFeedback', () => {
            this.show();
        });
    },

    show: function () {
        if (document.getElementById('report-feedback-overlay')) {
            return;
        }

        const currentTab = tabs.get(tabs.getSelected());
        const currentUrl = currentTab ? currentTab.url : '';

        const overlay = document.createElement('div');
        overlay.id = 'report-feedback-overlay';
        overlay.innerHTML = `
      <div id="report-feedback-modal">
        <h2>Report Feedback</h2>
        <div class="report-form-group">
          <label for="report-url">URL</label>
          <input type="text" id="report-url" value="${currentUrl}" readonly>
        </div>
        <div class="report-form-group">
          <label for="report-type">Type</label>
          <select id="report-type">
            <option value="true_positive">True Positive (Phishing)</option>
            <option value="false_positive">False Positive (Safe site marked as Phishing)</option>
            <option value="false_negative">False Negative (Phishing site marked as Safe)</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="report-form-group">
          <label for="report-description">Description</label>
          <textarea id="report-description" rows="4" placeholder="Describe the issue..."></textarea>
        </div>
        <div class="report-form-actions">
          <button id="report-cancel">Cancel</button>
          <button id="report-submit" class="primary">Submit</button>
        </div>
      </div>
    `;

        document.body.appendChild(overlay);

        document.getElementById('report-cancel').addEventListener('click', () => {
            this.close();
        });

        document.getElementById('report-submit').addEventListener('click', () => {
            this.submit();
        });

        // Close on click outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });
    },

    close: function () {
        const overlay = document.getElementById('report-feedback-overlay');
        if (overlay) {
            overlay.remove();
        }
    },

    submit: async function () {
        const url = document.getElementById('report-url').value;
        const type = document.getElementById('report-type').value;
        const description = document.getElementById('report-description').value;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: url,
                    type: type,
                    description: description
                })
            });

            if (response.ok) {
                alert('Report submitted successfully!');
                this.close();
            } else {
                alert('Failed to submit report.');
            }
        } catch (error) {
            console.error('Report API Error:', error);
            alert('Error connecting to server.');
        }
    }
};

module.exports = reportFeedback;
