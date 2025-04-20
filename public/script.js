// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const backendUrl = ''; // No need for full URL when served from same origin
    const socket = io(); // Connect to the WebSocket server

    // --- DOM Elements ---
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('logout-btn');
    const eventSelect = document.getElementById('event-select');
    const votingSection = document.getElementById('voting-section');
    const votingEventName = document.getElementById('voting-event-name');
    const candidateList = document.getElementById('candidate-list');
    const voteForm = document.getElementById('vote-form');
    const submitVoteBtn = document.getElementById('submit-vote-btn');
    const voteErrorMessage = document.getElementById('vote-error-message');
    const voteSuccessMessage = document.getElementById('vote-success-message');
    const resultsSection = document.getElementById('results-section');
    const resultsEventName = document.getElementById('results-event-name');
    const resultsDisplay = document.getElementById('results-display');
    const viewBlockchainBtn = document.getElementById('view-blockchain-btn');
    const blockchainDataArea = document.getElementById('blockchain-data');
    const notificationArea = document.getElementById('notification');

    let currentUser = null;
    let currentEventId = null;
    let currentCandidates = {}; // Store candidates for the selected event {id: name}

    // --- Utility Functions ---
    function showNotification(message, isError = false) {
        notificationArea.textContent = message;
        notificationArea.className = 'notification show'; // Reset classes and add show
        if (isError) {
            notificationArea.classList.add('error');
        } else {
            notificationArea.classList.add('success');
        }
        setTimeout(() => {
            notificationArea.className = 'notification'; // Hide it
        }, 3500);
    }

     function clearVoteMessages() {
        voteErrorMessage.textContent = '';
        voteSuccessMessage.textContent = '';
        voteErrorMessage.style.display = 'none';
        voteSuccessMessage.style.display = 'none';
    }

    function showVoteMessage(message, isError = true) {
        const element = isError ? voteErrorMessage : voteSuccessMessage;
        element.textContent = message;
        element.style.display = 'block';
    }


    // --- Authentication and Initial Load ---
    async function checkAuthAndLoad() {
        try {
            const response = await fetch(`${backendUrl}/check-auth`);
            const data = await response.json();

            if (!data.loggedIn) {
                window.location.href = '/login.html'; // Redirect if not logged in
                return;
            }

            currentUser = data.user;
            usernameDisplay.textContent = currentUser.username;

            // User is authenticated, load events
            await loadEvents();

        } catch (error) {
            console.error('Auth check failed:', error);
            showNotification('Session check failed. Please log in again.', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
        }
    }

    // --- Event Loading and Handling ---
    async function loadEvents() {
        try {
            const response = await fetch(`${backendUrl}/events`);
            if (!response.ok) throw new Error('Failed to load events.');
            const events = await response.json();

            eventSelect.innerHTML = '<option value="">-- Select an Event --</option>'; // Reset
            events.forEach(event => {
                const option = document.createElement('option');
                option.value = event.eventId;
                option.textContent = event.name;
                eventSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading events:', error);
            showNotification('Could not load voting events.', true);
        }
    }

    eventSelect.addEventListener('change', async () => {
        currentEventId = eventSelect.value;
        clearVoteMessages();
        voteForm.reset(); // Reset form when changing events
        submitVoteBtn.disabled = false;
        submitVoteBtn.textContent = 'Submit Vote';


        if (!currentEventId) {
            votingSection.style.display = 'none';
            resultsSection.style.display = 'none';
            return;
        }

        // Fetch candidates and show voting section
        await loadCandidates(currentEventId);
        // Fetch and display initial results for the selected event
        await fetchResults(currentEventId);

        // Display section titles
        const selectedEventName = eventSelect.options[eventSelect.selectedIndex].text;
        votingEventName.textContent = `Vote: ${selectedEventName}`;
        resultsEventName.textContent = `Results: ${selectedEventName}`;
        votingSection.style.display = 'block';
        resultsSection.style.display = 'block';
    });

    // --- Candidate Loading ---
    async function loadCandidates(eventId) {
        candidateList.innerHTML = '<p>Loading candidates...</p>';
        currentCandidates = {}; // Reset candidates map

        try {
            const response = await fetch(`${backendUrl}/events/${eventId}/candidates`);
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to load candidates.');
            }
            const candidates = await response.json();

            candidateList.innerHTML = ''; // Clear loading message
            if (candidates.length === 0) {
                candidateList.innerHTML = '<p>No candidates available for this event yet.</p>';
                submitVoteBtn.disabled = true; // Disable voting if no candidates
                return;
            }

             submitVoteBtn.disabled = false; // Ensure button is enabled if candidates load

            candidates.forEach(candidate => {
                currentCandidates[candidate.candidateId] = candidate.name; // Store mapping

                const label = document.createElement('label');
                label.classList.add('candidate-option');

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'candidate';
                radio.value = candidate.candidateId;
                radio.required = true;

                const span = document.createElement('span');
                span.classList.add('candidate-name');
                span.textContent = candidate.name;

                label.appendChild(radio);
                label.appendChild(span);
                candidateList.appendChild(label);
            });

        } catch (error) {
            console.error(`Error loading candidates for ${eventId}:`, error);
            candidateList.innerHTML = '<p style="color: red;">Could not load candidates.</p>';
             submitVoteBtn.disabled = true;
             showNotification(`Failed to load candidates: ${error.message}`, true);
        }
    }

    // --- Voting ---
    voteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearVoteMessages();

        const selectedCandidateInput = voteForm.querySelector('input[name="candidate"]:checked');
        if (!selectedCandidateInput) {
            showVoteMessage('Please select a candidate.', true);
            return;
        }
        if (!currentEventId) {
             showVoteMessage('Please select a voting event first.', true);
            return;
        }

        const candidateId = selectedCandidateInput.value;
        console.log(`Submitting vote for: Candidate ${candidateId} in Event ${currentEventId}`);
        submitVoteBtn.disabled = true;
        submitVoteBtn.textContent = 'Submitting...';

        try {
            const response = await fetch(`${backendUrl}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: currentEventId, candidateId: candidateId }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `Vote submission failed (HTTP ${response.status})`);
            }

            console.log('Vote submission response:', result);
            showVoteMessage(result.message || 'Vote submitted successfully!', false);
            // Optionally reset form or disable voting for this event visually
            // fetchResults(currentEventId); // Results updated via WebSocket now

        } catch (error) {
            console.error('Error submitting vote:', error);
            showVoteMessage(`Vote submission failed: ${error.message}`, true);
             submitVoteBtn.disabled = false; // Re-enable on failure if needed
             submitVoteBtn.textContent = 'Submit Vote';
        }
        // Note: Button is intentionally kept disabled after successful vote in this version
        // to visually reinforce the one-vote rule. Might need adjustment based on UX preference.
    });

    // --- Results Fetching and Display ---
    async function fetchResults(eventId) {
         if (!eventId) return; // Don't fetch if no event selected
        console.log(`Workspaceing results for event ${eventId}...`);
        try {
            const response = await fetch(`${backendUrl}/results/${eventId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const results = await response.json();
            console.log('Results received:', results);
            displayResults(results);

        } catch (error) {
            console.error(`Error fetching results for ${eventId}:`, error);
            resultsDisplay.innerHTML = '<p style="color: red;">Could not load results for this event.</p>';
            // Don't show general notification for specific result load failure
        }
    }

    function displayResults(results) {
        resultsDisplay.innerHTML = ''; // Clear previous results

        const candidates = Object.keys(results).sort();

        if (candidates.length === 0) {
             resultsDisplay.innerHTML = '<p>No votes cast yet for this event.</p>';
             return;
        }

        candidates.forEach(candidateName => {
            const count = results[candidateName];
            const resultItem = document.createElement('div');
            resultItem.classList.add('result-item');

            const candidateSpan = document.createElement('span');
            candidateSpan.classList.add('result-candidate');
            candidateSpan.textContent = candidateName; // Already have name from server

            const votesSpan = document.createElement('span');
            votesSpan.classList.add('result-votes');
            votesSpan.textContent = count;

            resultItem.appendChild(candidateSpan);
            resultItem.appendChild(votesSpan);
            resultsDisplay.appendChild(resultItem);
        });
    }

    // --- Blockchain Viewer ---
    async function fetchAndDisplayBlockchain() {
        console.log('Fetching blockchain data...');
        blockchainDataArea.textContent = 'Loading blockchain...';
        try {
            const response = await fetch(`${backendUrl}/blockchain`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blockchainInfo = await response.json();
            console.log('Blockchain data received:', blockchainInfo);
            blockchainDataArea.textContent = JSON.stringify(blockchainInfo, null, 2); // Pretty print

        } catch (error) {
            console.error('Error fetching blockchain data:', error);
            blockchainDataArea.textContent = 'Error loading blockchain data.';
            showNotification('Failed to fetch blockchain data.', true);
        }
    }

    viewBlockchainBtn.addEventListener('click', fetchAndDisplayBlockchain);


    // --- WebSocket Event Listener ---
    socket.on('connect', () => {
        console.log('WebSocket connected:', socket.id);
    });

    socket.on('results_updated', (data) => {
        console.log('WebSocket received results_updated:', data);
        // Only update if the results are for the currently selected event
        if (data.eventId === currentEventId) {
            console.log(`Updating results display for current event ${currentEventId}`);
            displayResults(data.results);
            showNotification(`Results updated for ${eventSelect.options[eventSelect.selectedIndex].text}`, false);
        }
    });

     socket.on('connect_error', (err) => {
        console.error('WebSocket connection error:', err);
        showNotification('Real-time connection failed. Results may be delayed.', true);
    });

     socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
         showNotification('Lost real-time connection. Please refresh if issues persist.', true);
    });


    // --- Logout ---
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch(`${backendUrl}/logout`, { method: 'POST' });
            window.location.href = '/login.html'; // Redirect to login page
        } catch (error) {
            console.error('Logout failed:', error);
            showNotification('Logout failed. Please try again.', true);
        }
    });

    // --- Initial Check and Load ---
    checkAuthAndLoad();

}); // End DOMContentLoaded

// Dark mode toggle functionality
document.addEventListener('DOMContentLoaded', function() {
  const themeToggle = document.getElementById('theme-toggle');
  
  // Check for saved theme preference or default to light mode
  if (localStorage.getItem('theme') === 'dark' || 
     (window.matchMedia('(prefers-color-scheme: dark)').matches && 
      !localStorage.getItem('theme'))) {
    document.body.classList.add('dark-mode');
  }
  
  // Handle toggle click
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      // Toggle dark mode class on body
      document.body.classList.toggle('dark-mode');
      
      // Save preference to localStorage
      if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
      } else {
        localStorage.setItem('theme', 'light');
      }
    });
  }
});