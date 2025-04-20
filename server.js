// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const http = require('http'); // Required for socket.io
const { Server } = require("socket.io"); // socket.io server class

const Blockchain = require('./blockchain');

const app = express();
const port = 3000;
const saltRounds = 10; // For bcrypt password hashing

// --- In-Memory Data Stores (Replace with Database for Production) ---
let users = {}; // { username: { userId, username, passwordHash, isAdmin } }
let events = {}; // { eventId: { eventId, name, description, candidates: { candidateId: { candidateId, name } }, isActive } }
let votesCast = new Set(); // Stores "userId-eventId" strings to prevent double voting
let nextUserId = 1;
let nextEventId = 1;
let nextCandidateId = 100; // Start candidate IDs higher to avoid clashes

// --- Blockchain Initialization ---
const secureVoteChain = new Blockchain();

// --- Server & WebSocket Setup ---
const server = http.createServer(app); // Create HTTP server for Express app
const io = new Server(server, { // Attach socket.io to the HTTP server
    cors: {
        origin: "*", // Allow all origins for simplicity (restrict in production)
        methods: ["GET", "POST"]
    }
});

// --- Middleware ---
app.use(cors()); // Enable CORS for REST API
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Handle form submissions

// Session Configuration (In-Memory Store - NOT FOR PRODUCTION)
app.use(session({
    secret: 'your-very-secret-key-change-this', // Change this to a strong secret
    resave: false,
    saveUninitialized: false, // Don't save sessions for unauthenticated users
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true, // Prevent client-side JS access
        maxAge: 1000 * 60 * 60 * 24 // Session duration (e.g., 1 day)
    }
}));

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next(); // User is logged in, proceed
    }
    res.status(401).json({ message: 'Unauthorized: Please log in.' });
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.isAdmin) {
        return next(); // User is admin, proceed
    }
    res.status(403).json({ message: 'Forbidden: Admin access required.' });
}

// Serve static files (HTML, CSS, JS)
app.use(express.static('public'));

// --- Authentication Endpoints ---

// POST /register
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (users[username]) {
        return res.status(409).json({ message: 'Username already exists.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const userId = `user-${nextUserId++}`;
        users[username] = { userId, username, passwordHash, isAdmin: Object.keys(users).length === 0 }; // First user is admin
        console.log('User registered:', users[username]);
        res.status(201).json({ message: 'User registered successfully. Please log in.', userId: users[username].userId, isAdmin: users[username].isAdmin });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
});

// POST /login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users[username];

    if (!user) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }

    try {
        const match = await bcrypt.compare(password, user.passwordHash);
        if (match) {
            // Passwords match - Create session
            req.session.user = { userId: user.userId, username: user.username, isAdmin: user.isAdmin };
            console.log('User logged in:', req.session.user);
            res.status(200).json({
                message: 'Login successful.',
                user: { userId: user.userId, username: user.username, isAdmin: user.isAdmin }
            });
        } else {
            // Passwords don't match
            res.status(401).json({ message: 'Invalid username or password.' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

// POST /logout
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ message: 'Could not log out, please try again.' });
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        console.log('User logged out');
        res.status(200).json({ message: 'Logout successful.' });
    });
});

// GET /check-auth - Check if user is currently logged in
app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.status(200).json({ loggedIn: true, user: req.session.user });
    } else {
        res.status(200).json({ loggedIn: false });
    }
});


// --- Admin Endpoints ---

// POST /admin/events - Create a new voting event
app.post('/admin/events', isAuthenticated, isAdmin, (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Event name is required.' });
    }
    const eventId = `event-${nextEventId++}`;
    events[eventId] = {
        eventId,
        name,
        description: description || '',
        candidates: {}, // Initialize empty candidates object
        isActive: true // Events are active by default
    };
    console.log('Event created:', events[eventId]);
    io.emit('events_updated', Object.values(events).filter(e => e.isActive)); // Notify clients
    res.status(201).json({ message: 'Event created successfully.', event: events[eventId] });
});

// GET /admin/events - Get all events (for admin view)
app.get('/admin/events', isAuthenticated, isAdmin, (req, res) => {
    res.status(200).json(Object.values(events));
});

// POST /admin/events/:eventId/candidates - Add a candidate to an event
app.post('/admin/events/:eventId/candidates', isAuthenticated, isAdmin, (req, res) => {
    const { eventId } = req.params;
    const { name } = req.body;
    const event = events[eventId];

    if (!event) {
        return res.status(404).json({ message: 'Event not found.' });
    }
    if (!name) {
        return res.status(400).json({ message: 'Candidate name is required.' });
    }

    const candidateId = `cand-${nextCandidateId++}`;
    event.candidates[candidateId] = { candidateId, name };
    console.log(`Candidate added to event ${eventId}:`, event.candidates[candidateId]);
    io.emit('candidates_updated', { eventId, candidates: event.candidates }); // Notify clients
    res.status(201).json({ message: 'Candidate added successfully.', candidate: event.candidates[candidateId] });
});

// POST /admin/users - Create a user (Admin function)
app.post('/admin/users', isAuthenticated, isAdmin, async (req, res) => {
     // Reuse registration logic, but ensure only admin can call this specific endpoint
    const { username, password, makeAdmin } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (users[username]) {
        return res.status(409).json({ message: 'Username already exists.' });
    }
    try {
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const userId = `user-${nextUserId++}`;
        users[username] = { userId, username, passwordHash, isAdmin: !!makeAdmin }; // Set admin status based on request
        console.log('User created by admin:', users[username]);
        // Maybe emit user list update if needed for admin dashboard
        res.status(201).json({ message: 'User created successfully.', user: { userId, username, isAdmin: users[username].isAdmin} });
    } catch (error) {
        console.error('Admin user creation error:', error);
        res.status(500).json({ message: 'Internal server error during user creation.' });
    }
});


// --- User Endpoints ---

// GET /events - Get list of active voting events
app.get('/events', isAuthenticated, (req, res) => {
    const activeEvents = Object.values(events).filter(event => event.isActive);
    res.status(200).json(activeEvents);
});

// GET /events/:eventId/candidates - Get candidates for a specific event
app.get('/events/:eventId/candidates', isAuthenticated, (req, res) => {
    const { eventId } = req.params;
    const event = events[eventId];
    if (!event || !event.isActive) {
        return res.status(404).json({ message: 'Active event not found.' });
    }
    res.status(200).json(Object.values(event.candidates));
});

// POST /vote - Submit a vote
app.post('/vote', isAuthenticated, (req, res) => {
    const { eventId, candidateId } = req.body;
    const userId = req.session.user.userId;
    const event = events[eventId];

    // --- Validations ---
    if (!event || !event.isActive) {
        console.warn(`Vote attempt failed: Event ${eventId} not found or inactive.`);
        return res.status(404).json({ message: 'Voting event not found or is not active.' });
    }
    if (!event.candidates[candidateId]) {
         console.warn(`Vote attempt failed: Candidate ${candidateId} not found in event ${eventId}.`);
        return res.status(400).json({ message: 'Invalid candidate selected for this event.' });
    }
    const voteKey = `${userId}-${eventId}`;
    if (votesCast.has(voteKey)) {
         console.warn(`Vote attempt failed: User ${userId} already voted in event ${eventId}.`);
        return res.status(403).json({ message: 'You have already voted in this event.' });
    }
    // --- End Validations ---

    try {
        // Create the vote transaction
        const voteTransaction = {
            userId: userId,
            eventId: eventId,
            candidateId: candidateId,
            timestamp: new Date().toISOString()
        };

        // Add the vote to the blockchain
        secureVoteChain.addVote(voteTransaction);

        // Mark user as having voted for this event
        votesCast.add(voteKey);
        console.log(`Vote recorded: User ${userId}, Event ${eventId}, Candidate ${candidateId}`);

        // Calculate updated results for this specific event
        const updatedResults = secureVoteChain.getVoteCounts(eventId);

        // Map candidate IDs to names for the results emission
        const resultsWithNames = {};
        for (const candId in updatedResults) {
            const name = event.candidates[candId]?.name || 'Unknown Candidate';
            resultsWithNames[name] = updatedResults[candId];
        }


        // Emit real-time update via WebSockets
        io.emit('results_updated', { eventId: eventId, results: resultsWithNames });
        console.log(`Emitted results_updated for event ${eventId}`);

        res.status(200).json({ message: 'Vote submitted successfully!' });

    } catch (error) {
        console.error('Error processing vote:', error);
        res.status(500).json({ message: 'Internal server error processing vote.' });
    }
});

// GET /results/:eventId - Get results for a specific event
app.get('/results/:eventId', isAuthenticated, (req, res) => {
    const { eventId } = req.params;
    const event = events[eventId];

    if (!event) {
         return res.status(404).json({ message: 'Event not found.' });
    }

    try {
        const voteCounts = secureVoteChain.getVoteCounts(eventId); // Counts by candidateId

        // Map candidate IDs to names
         const resultsWithNames = {};
        for (const candId in voteCounts) {
            const name = event.candidates[candId]?.name || `Unknown (${candId})`; // Handle missing candidate lookup gracefully
            resultsWithNames[name] = voteCounts[candId];
        }

        res.status(200).json(resultsWithNames);
    } catch (error) {
        console.error(`Error retrieving results for event ${eventId}:`, error);
        res.status(500).json({ message: 'Internal server error retrieving results.' });
    }
});

// GET /blockchain - View the entire blockchain (for demo/verification)
app.get('/blockchain', isAuthenticated, (req, res) => { // Can add isAdmin middleware if needed
    try {
        res.status(200).json({
            chain: secureVoteChain.chain,
            isValid: secureVoteChain.isChainValid()
        });
    } catch (error) {
        console.error('Error retrieving blockchain:', error);
        res.status(500).json({ message: 'Internal server error retrieving blockchain.' });
    }
});


// --- WebSocket Connection Handling ---
io.on('connection', (socket) => {
    console.log('A user connected via WebSocket:', socket.id);

    // Send current blockchain validity status on connect (optional)
    // socket.emit('chain_status', { isValid: secureVoteChain.isChainValid() });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });

    // Handle request for initial data if needed (e.g., admin dashboard)
    socket.on('request_initial_data', (ack) => {
         console.log('Initial data requested by', socket.id);
         // Send data needed immediately on dashboard load
         const initialData = {
             events: Object.values(events),
             // Send results for all events (or maybe just active ones)
             allResults: Object.keys(events).reduce((acc, eventId) => {
                const event = events[eventId];
                const counts = secureVoteChain.getVoteCounts(eventId);
                const resultsWithNames = {};
                for (const candId in counts) {
                   const name = event.candidates[candId]?.name || `Unknown (${candId})`;
                   resultsWithNames[name] = counts[candId];
                }
                acc[eventId] = { eventName: event.name, results: resultsWithNames };
                return acc;
             }, {})
         };
         ack(initialData); // Use acknowledgement callback to send data back
    });
});

// --- Start the Server ---
// Use the http server (which includes express app and socket.io)
server.listen(port, () => {
    console.log(`SecureVote Enhanced backend server running at http://localhost:${port}`);
    console.log(`Login page accessible at http://localhost:${port}/login.html`);
    // Create a default admin user if none exist
    if (Object.keys(users).length === 0) {
        bcrypt.hash('adminpass', saltRounds).then(hash => {
             const adminId = `user-${nextUserId++}`;
            users['admin'] = { userId: adminId, username: 'admin', passwordHash: hash, isAdmin: true };
            console.log("Default admin user created: username='admin', password='adminpass'");
        }).catch(err => console.error("Failed to create default admin user:", err));
    }
});