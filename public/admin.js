// public/admin.js
document.addEventListener('DOMContentLoaded', async () => {
    const backendUrl = ''; // No need for full URL
    const socket = io(); // Connect to WebSocket

    // --- DOM Elements ---
    const adminUsernameDisplay = document.getElementById('admin-username-display');
    const logoutBtn = document.getElementById('logout-btn');
    // Event Creation
    const createEventForm = document.getElementById('create-event-form');
    const eventNameInput = document.getElementById('event-name');
    const eventDescriptionInput = document.getElementById('event-description');
    const eventMessage = document.getElementById('event-message');
    // Candidate Addition
    const addCandidateForm = document.getElementById('add-candidate-form');
    const candidateEventSelect = document.getElementById('candidate-event-select');
    const candidateNameInput = document.getElementById('candidate-name');
    const candidateMessage = document.getElementById('candidate-message');
    // User Creation
    const createUserForm = document.getElementById('create-user-form');
    const newUsernameInput = document.getElementById('new-username');
    const newPasswordInput = document.getElementById('new-password');
    const makeAdminCheckbox = document.getElementById('make-admin');
    const userMessage = document.getElementById('user-message');
    // Overview
    const adminEventsDisplay = document.getElementById('admin-events-display');
    // Blockchain Viewer
    const adminViewBlockchainBtn = document.getElementById('admin-view-blockchain-btn');
    const adminBlockchainDataArea = document.getElementById('admin-blockchain-data');
    // General Notification
    const notificationArea = document.getElementById('notification');

    let currentUser = null;
    let allEventsData = {}; // Store { eventId: { name, candidates: {}, ... } }
    let allResultsData = {}; // Store { eventId: { results: { candidateName: count } } }

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

    function showFormMessage(element, message, isSuccess = true) {
        element.textContent = message;
        element.className = isSuccess ? 'success-text' : 'error-text'; // Use success/error class
        element.style.display = 'block';
        setTimeout(() => { // Clear message after a delay
            element.textContent = '';
            element.style.display = 'none';
        }, 4000);
    }

    // --- Authentication and Initial Load ---
    async function checkAuthAndLoadAdmin() {
        try {
            const response = await fetch(`${backendUrl}/check-auth`);
            const data = await response.json();

            if (!data.loggedIn || !data.user.isAdmin) {
                window.location.href = '/login.html'; // Redirect if not logged in or not admin
                return;
            }

            currentUser = data.user;
            adminUsernameDisplay.textContent = currentUser.username;

            // Request initial data via WebSocket after connection established
            socket.on('connect', () => {
                console.log('Admin WebSocket connected:', socket.id);
                requestInitialData(); // Fetch data once connected
            });
            if (socket.connected) { // If already connected before listener was added
                requestInitialData();
            }

        } catch (error) {
            console.error('Admin Auth check failed:', error);
            showNotification('Session check failed. Please log in again.', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
        }
    }

    // Function to request initial admin data
    function requestInitialData() {
        console.log("Requesting initial admin data...");
        socket.emit('request_initial_data', (initialData) => {
            console.log('Initial admin data received:', initialData);
            if (initialData) {
                // Process Events
                allEventsData = initialData.events.reduce((acc, event) => {
                    acc[event.eventId] = event;
                    return acc;
                }, {});
                // Process Results
                allResultsData = initialData.allResults || {};

                populateEventSelects(); // Populate dropdowns
                displayAdminOverview(); // Display events and results
            } else {
                console.error("Did not receive initial data from server.");
                showNotification("Could not load initial admin data.", true);
            }
        });
    }

    // Populate event dropdowns in forms
    function populateEventSelects() {
        candidateEventSelect.innerHTML = '<option value="">-- Select Event --</option>'; // Reset
        const sortedEvents = Object.values(allEventsData).sort((a, b) => a.name.localeCompare(b.name));

        sortedEvents.forEach(event => {
            const option = document.createElement('option');
            option.value = event.eventId;
            option.textContent = event.name;
            candidateEventSelect.appendChild(option.cloneNode(true)); // Clone for candidate select
        });
    }

    // --- Event Creation ---
    createEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = eventNameInput.value.trim();
        const description = eventDescriptionInput.value.trim();

        if (!name) {
            showFormMessage(eventMessage, 'Event name is required.', false);
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/admin/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to create event.');

            showFormMessage(eventMessage, result.message, true);
            createEventForm.reset();
            // No need to manually update local data, rely on WebSocket update 'events_updated'

        } catch (error) {
            console.error('Error creating event:', error);
            showFormMessage(eventMessage, error.message, false);
        }
    });

    // --- Candidate Addition ---
    addCandidateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = candidateEventSelect.value;
        const name = candidateNameInput.value.trim();

        if (!eventId) {
            showFormMessage(candidateMessage, 'Please select an event.', false);
            return;
        }
        if (!name) {
            showFormMessage(candidateMessage, 'Candidate name is required.', false);
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/admin/events/${eventId}/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to add candidate.');

            showFormMessage(candidateMessage, result.message, true);
            addCandidateForm.reset(); // Reset form, but keep event selected maybe?
            candidateEventSelect.value = ""; // Or reset event select too
            // No need to manually update, rely on WebSocket 'candidates_updated'

        } catch (error) {
            console.error('Error adding candidate:', error);
            showFormMessage(candidateMessage, error.message, false);
        }
    });

    // --- User Creation ---
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = newUsernameInput.value.trim();
        const password = newPasswordInput.value;
        const makeAdmin = makeAdminCheckbox.checked;

        if (!username || !password) {
            showFormMessage(userMessage, 'Username and password are required.', false);
            return;
        }
        if (password.length < 6) {
            showFormMessage(userMessage, 'Password must be at least 6 characters.', false);
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, makeAdmin }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to create user.');

            showFormMessage(userMessage, result.message, true);
            createUserForm.reset();
            // Optionally: update an admin user list if displayed elsewhere

        } catch (error) {
            console.error('Error creating user:', error);
            showFormMessage(userMessage, error.message, false);
        }
    });

    // --- Display Events and Results Overview ---
    function displayAdminOverview() {
        adminEventsDisplay.innerHTML = ''; // Clear previous
        const sortedEventIds = Object.keys(allEventsData).sort((a, b) => allEventsData[a].name.localeCompare(allEventsData[b].name));

        if (sortedEventIds.length === 0) {
            adminEventsDisplay.innerHTML = '<p>No events created yet.</p>';
            return;
        }

        sortedEventIds.forEach(eventId => {
            const event = allEventsData[eventId];
            const eventResults = allResultsData[eventId]?.results || {}; // Get results for this event

            const eventDiv = document.createElement('div');
            eventDiv.classList.add('event-overview');
            eventDiv.dataset.eventId = eventId; // Store eventId for updates

            const eventTitle = document.createElement('h3');
            eventTitle.textContent = `${event.name} ${event.isActive ? '(Active)' : '(Inactive)'}`; // Indicate status
            eventDiv.appendChild(eventTitle);

            if (event.description) {
                const eventDesc = document.createElement('p');
                eventDesc.textContent = event.description;
                eventDesc.style.fontSize = '0.9em';
                eventDesc.style.color = '#555';
                eventDiv.appendChild(eventDesc);
            }

            const candidatesTitle = document.createElement('h4');
            candidatesTitle.textContent = 'Candidates:';
            candidatesTitle.style.marginTop = '0.5rem';
            candidatesTitle.style.marginBottom = '0.2rem';
            candidatesTitle.style.fontSize = '1em';
            candidatesTitle.style.color = 'var(--secondary-color)';
            eventDiv.appendChild(candidatesTitle);

            const candidatesList = document.createElement('ul');
            candidatesList.style.listStyle = 'none';
            candidatesList.style.paddingLeft = '0';
            const candidateIds = Object.keys(event.candidates);
            if (candidateIds.length > 0) {
                candidateIds.forEach(candId => {
                    const candItem = document.createElement('li');
                    candItem.textContent = `- ${event.candidates[candId].name} (ID: ${candId})`;
                    candItem.style.fontSize = '0.9em';
                    candidatesList.appendChild(candItem);
                });
            } else {
                candidatesList.innerHTML = '<li>No candidates added yet.</li>';
                candidatesList.style.fontStyle = 'italic';
                candidatesList.style.color = '#777';
            }
            eventDiv.appendChild(candidatesList);

            const resultsTitle = document.createElement('h4');
            resultsTitle.textContent = 'Live Results:';
            resultsTitle.style.marginTop = '1rem';
            resultsTitle.style.marginBottom = '0.2rem';
            resultsTitle.style.fontSize = '1em';
            resultsTitle.style.color = 'var(--accent-color)';
            eventDiv.appendChild(resultsTitle);

            const resultsList = document.createElement('div');
            resultsList.classList.add('results-list'); // Add class for potential styling
            renderResultsList(resultsList, eventResults); // Use helper function
            eventDiv.appendChild(resultsList);

            adminEventsDisplay.appendChild(eventDiv);
        });
    }

    // Helper to render the results list within an event overview
    function renderResultsList(containerElement, results) {
        containerElement.innerHTML = ''; // Clear previous content
        const sortedCandidates = Object.keys(results).sort();

        if (sortedCandidates.length === 0) {
            containerElement.innerHTML = '<p style="font-size: 0.9em; color: #777;">No votes cast yet.</p>';
            return;
        }

        sortedCandidates.forEach(candidateName => {
            const count = results[candidateName];
            const resultItem = document.createElement('div');
            resultItem.classList.add('result-item'); // Reuse user dashboard style if appropriate
            resultItem.style.padding = '0.4rem 0'; // Adjust padding

            const candidateSpan = document.createElement('span');
            candidateSpan.classList.add('result-candidate');
            candidateSpan.textContent = candidateName;
            candidateSpan.style.fontWeight = 'normal'; // Less emphasis than user view maybe

            const votesSpan = document.createElement('span');
            votesSpan.classList.add('result-votes');
            votesSpan.textContent = count;

            resultItem.appendChild(candidateSpan);
            resultItem.appendChild(votesSpan);
            containerElement.appendChild(resultItem);
        });
    }

    // --- Blockchain Viewer (Admin) ---
    async function fetchAndDisplayAdminBlockchain() {
        console.log('Fetching blockchain data (Admin)...');
        adminBlockchainDataArea.textContent = 'Loading blockchain...';
        try {
            const response = await fetch(`${backendUrl}/blockchain`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blockchainInfo = await response.json();
            console.log('Blockchain data received (Admin):', blockchainInfo);
            adminBlockchainDataArea.textContent = JSON.stringify(blockchainInfo, null, 2); // Pretty print

        } catch (error) {
            console.error('Error fetching blockchain data (Admin):', error);
            adminBlockchainDataArea.textContent = 'Error loading blockchain data.';
            showNotification('Failed to fetch blockchain data.', true);
        }
    }
    adminViewBlockchainBtn.addEventListener('click', fetchAndDisplayAdminBlockchain);

    // --- WebSocket Event Listeners (Admin) ---
    socket.on('connect_error', (err) => {
        console.error('Admin WebSocket connection error:', err);
        showNotification('Real-time connection failed. Data may be outdated.', true);
    });

    socket.on('disconnect', () => {
        console.log('Admin WebSocket disconnected');
        showNotification('Lost real-time connection. Please refresh if issues persist.', true);
    });

    // Listen for updates to events
    socket.on('events_updated', (updatedEvents) => {
        console.log('WebSocket received events_updated:', updatedEvents);
        allEventsData = updatedEvents.reduce((acc, event) => {
            acc[event.eventId] = event;
            return acc;
        }, {});
        populateEventSelects();
        displayAdminOverview(); // Re-render the overview
        showNotification('Event list updated.', false);
    });

    // Listen for updates to candidates within an event
    socket.on('candidates_updated', (data) => {
        console.log('WebSocket received candidates_updated:', data);
        const { eventId, candidates } = data;
        if (allEventsData[eventId]) {
            allEventsData[eventId].candidates = candidates;
            displayAdminOverview(); // Re-render the overview to show new candidate
            showNotification(`Candidates updated for event ${allEventsData[eventId].name}.`, false);
        }
    });

    // Listen for overall results updates
    socket.on('results_updated', (data) => {
        console.log('WebSocket received results_updated (Admin):', data);
        const { eventId, results } = data;

        // Update the local results cache
        if (!allResultsData[eventId]) {
            allResultsData[eventId] = { eventName: allEventsData[eventId]?.name || 'Unknown Event', results: {} };
        }
        allResultsData[eventId].results = results;

        // Update the specific event's results list in the UI
        const eventDiv = adminEventsDisplay.querySelector(`.event-overview[data-event-id="${eventId}"]`);
        if (eventDiv) {
            const resultsListContainer = eventDiv.querySelector('.results-list');
            if (resultsListContainer) {
                renderResultsList(resultsListContainer, results); // Re-render just the results part
                console.log(`Admin overview updated for event ${eventId}`);
            }
        } else {
            // If the event wasn't displayed before (e.g., just created), re-render everything
            displayAdminOverview();
        }
        // Maybe a less intrusive notification for admins? Or none?
        // showNotification(`Results updated for event ${allEventsData[eventId]?.name}.`, false);
    });

    // --- Logout ---
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch(`${backendUrl}/logout`, { method: 'POST' });
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Admin Logout failed:', error);
            showNotification('Logout failed. Please try again.', true);
        }
    });

    // --- Initial Check and Load ---
    checkAuthAndLoadAdmin();

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
});