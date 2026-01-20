// AtomSpace Analytics
// Loads analytics pipelines from RocksDB and displays visualizations

let ws = null;
let analyticsLoaded = false;
let pendingCommand = null;

// Bootstrap code to set up analytics subsystem
const BOOTSTRAP_CODE = `
(use-modules (opencog) (opencog persist) (opencog persist-rocks))

; Create child AtomSpace for analytics
(AtomSpace "analytics" (AtomSpaceOf (Link)))

; Load analytics code from RocksDB
(cog-execute!
    (PureExec
        (AtomSpace "analytics")
        (SetValue
            (RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
            (Predicate "*-open-*")
            (AtomSpace "analytics"))
        (SetValue
            (RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
            (Predicate "*-load-atomspace-*"))))
`;

// Command to run the type-counts pipeline
const TYPE_COUNTS_COMMAND = '(cog-execute! (Name "type-counts"))';

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    connect();
});

function setupEventListeners() {
    const runTypeCountsBtn = document.getElementById('run-type-counts');
    const refreshBtn = document.getElementById('refresh-btn');

    runTypeCountsBtn.addEventListener('click', runTypeCounts);
    refreshBtn.addEventListener('click', () => {
        analyticsLoaded = false;
        loadAnalytics();
    });
}

function connect() {
    const statusElement = document.getElementById('connection-status');

    // Get saved server URL from localStorage
    const savedBaseUrl = localStorage.getItem('cogserver-url');
    const baseUrl = savedBaseUrl || `ws://${window.location.hostname}:${window.location.port}/`;
    const serverUrl = baseUrl + 'json';

    console.log('Connecting to:', serverUrl);
    statusElement.textContent = 'Connecting...';
    statusElement.style.color = 'orange';

    try {
        ws = new WebSocket(serverUrl);

        ws.onopen = () => {
            console.log('Connected to CogServer');
            statusElement.textContent = 'Connected';
            statusElement.style.color = 'green';

            // Load analytics on connection
            loadAnalytics();
        };

        ws.onmessage = (event) => {
            try {
                handleResponse(event.data);
            } catch (error) {
                console.error('Error handling response:', error);
                showError('Error processing response: ' + error.message);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusElement.textContent = 'Connection Error';
            statusElement.style.color = 'red';
            showError('Connection error - make sure CogServer is running');
        };

        ws.onclose = () => {
            console.log('Disconnected from CogServer');
            statusElement.textContent = 'Disconnected';
            statusElement.style.color = 'red';
            disableControls();

            // Try to reconnect after 3 seconds
            setTimeout(() => {
                statusElement.textContent = 'Reconnecting...';
                statusElement.style.color = 'orange';
                connect();
            }, 3000);
        };

    } catch (error) {
        console.error('Connection error:', error);
        statusElement.textContent = 'Connection Failed';
        statusElement.style.color = 'red';
        showError('Failed to connect: ' + error.message);
    }
}

function loadAnalytics() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Not connected to server');
        return;
    }

    const analyticsStatus = document.getElementById('analytics-status');
    analyticsStatus.textContent = 'Loading pipelines...';
    analyticsStatus.style.color = 'orange';

    showLoading(true, 'Loading analytics pipelines from RocksDB...');
    pendingCommand = 'bootstrap';

    // Send bootstrap code
    console.log('Sending bootstrap code...');
    ws.send(BOOTSTRAP_CODE + '\n');
}

function runTypeCounts() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Not connected to server');
        return;
    }

    if (!analyticsLoaded) {
        showError('Analytics not loaded yet. Please wait...');
        return;
    }

    showLoading(true, 'Running type-counts pipeline...');
    pendingCommand = 'type-counts';

    console.log('Running type-counts pipeline...');
    ws.send(TYPE_COUNTS_COMMAND + '\n');
}

function handleResponse(data) {
    console.log('Raw response:', data);

    // Parse MCP format response
    let response;
    try {
        response = JSON.parse(data);
    } catch (e) {
        // Not JSON, might be raw Scheme output
        console.log('Non-JSON response:', data);
        handleRawResponse(data);
        return;
    }

    // Check for MCP format
    if (response.content && Array.isArray(response.content)) {
        if (response.isError === true) {
            showError('Server error: ' + (response.content[0]?.text || 'Unknown error'));
            showLoading(false);
            return;
        }

        const contentText = response.content[0]?.text || '';
        console.log('Content text:', contentText);

        // Try to parse the content as JSON
        try {
            const result = JSON.parse(contentText);
            processResult(result);
        } catch (e) {
            // Content is not JSON, treat as raw output
            processResult(contentText);
        }
    } else {
        // Direct response
        processResult(response);
    }
}

function handleRawResponse(data) {
    // Handle raw Scheme output (not JSON wrapped)
    if (pendingCommand === 'bootstrap') {
        // Bootstrap completed
        analyticsLoaded = true;
        const analyticsStatus = document.getElementById('analytics-status');
        analyticsStatus.textContent = 'Loaded';
        analyticsStatus.style.color = 'green';
        enableControls();
        showLoading(false);
        console.log('Analytics bootstrap complete');
    } else if (pendingCommand === 'type-counts') {
        // Type counts result
        showLoading(false);
        displayTypeCountsResult(data);
    }
    pendingCommand = null;
}

function processResult(result) {
    showLoading(false);

    if (pendingCommand === 'bootstrap') {
        analyticsLoaded = true;
        const analyticsStatus = document.getElementById('analytics-status');
        analyticsStatus.textContent = 'Loaded';
        analyticsStatus.style.color = 'green';
        enableControls();
        console.log('Analytics bootstrap complete');
    } else if (pendingCommand === 'type-counts') {
        displayTypeCountsResult(result);
    }

    pendingCommand = null;
}

function displayTypeCountsResult(result) {
    console.log('Type counts result:', result);

    const chartContainer = document.getElementById('chart-container');
    const barChart = document.getElementById('bar-chart');
    const summaryPanel = document.getElementById('results-summary');
    const summaryText = document.getElementById('summary-text');

    // Clear previous results
    barChart.innerHTML = '';

    // Parse the result - it should be a LinkValue with formatted entries
    // Each entry is like: "Usage count of type: <Type> is equal to N"
    let typeCounts = [];

    if (typeof result === 'string') {
        // Parse string output
        const lines = result.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const match = line.match(/Usage count of type:\s*(\S+)\s*is equal to\s*(\d+)/);
            if (match) {
                typeCounts.push({ type: match[1], count: parseInt(match[2]) });
            }
        }
    } else if (Array.isArray(result)) {
        // Array of results
        for (const item of result) {
            if (typeof item === 'string') {
                const match = item.match(/Usage count of type:\s*(\S+)\s*is equal to\s*(\d+)/);
                if (match) {
                    typeCounts.push({ type: match[1], count: parseInt(match[2]) });
                }
            }
        }
    }

    if (typeCounts.length === 0) {
        // No parsed results, show raw output
        barChart.innerHTML = `<pre style="color: var(--text-primary); white-space: pre-wrap;">${JSON.stringify(result, null, 2)}</pre>`;
        chartContainer.classList.remove('hidden');
        summaryPanel.classList.add('hidden');
        return;
    }

    // Sort by count descending
    typeCounts.sort((a, b) => b.count - a.count);

    // Find max count for scaling
    const maxCount = typeCounts[0]?.count || 1;

    // Create bar chart
    for (const item of typeCounts) {
        const row = document.createElement('div');
        row.className = 'bar-row';

        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = item.type;
        label.title = item.type;

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.width = `${(item.count / maxCount) * 100}%`;

        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = item.count.toLocaleString();

        wrapper.appendChild(bar);
        row.appendChild(label);
        row.appendChild(wrapper);
        row.appendChild(value);
        barChart.appendChild(row);
    }

    // Show summary
    const totalAtoms = typeCounts.reduce((sum, item) => sum + item.count, 0);
    summaryText.textContent = `Found ${typeCounts.length} atom types with ${totalAtoms.toLocaleString()} total atoms.`;

    chartContainer.classList.remove('hidden');
    summaryPanel.classList.remove('hidden');
}

function enableControls() {
    document.getElementById('run-type-counts').disabled = false;
    document.getElementById('refresh-btn').disabled = false;
}

function disableControls() {
    document.getElementById('run-type-counts').disabled = true;
    document.getElementById('refresh-btn').disabled = true;
    analyticsLoaded = false;
}

function showLoading(show, message = 'Loading...') {
    const loadingPanel = document.getElementById('loading-panel');
    const loadingMessage = document.getElementById('loading-message');

    if (show) {
        loadingMessage.textContent = message;
        loadingPanel.classList.remove('hidden');
    } else {
        loadingPanel.classList.add('hidden');
    }
}

function showError(message) {
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');

    if (message) {
        errorMessage.textContent = message;
        errorPanel.classList.remove('hidden');
    } else {
        errorPanel.classList.add('hidden');
    }
}
