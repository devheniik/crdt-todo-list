import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as Automerge from '@automerge/automerge';
import { dbService } from './storage.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(bodyParser.json());

// Middleware to extract user ID from request
// In a real application, this would be from authentication
const getUserId = (req) => {
    // For testing, we'll use the userId from headers or a default value
    return req.headers['user-id'] || 'default-user';
};

// Create a new session
app.post('/sessions', async (req, res) => {
    try {
        const userId = req.body.userId || getUserId(req);
        const session = await dbService.createUserSession(userId);

        res.json({
            success: true,
            sessionId: session.sessionId,
            userId: session.userId
        });
    } catch (err) {
        console.error('Session creation error:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Close a session
app.delete('/sessions', async (req, res) => {
    try {
        const userId = getUserId(req);
        const result = await dbService.closeUserSession(userId);

        res.json({
            success: result,
            message: result ? 'Session closed successfully' : 'No active session found'
        });
    } catch (err) {
        console.error('Session close error:', err);
        res.status(500).json({ error: 'Failed to close session' });
    }
});

// Commit changes
app.post('/commit', async (req, res) => {
    try {
        const userId = getUserId(req);
        const entityTypes = req.body.entityTypes; // Optional: specific entity types to commit

        const results = await dbService.commitChanges(userId, entityTypes);

        res.json({
            success: true,
            results
        });
    } catch (err) {
        console.error('Commit error:', err);
        res.status(500).json({ error: 'Failed to commit changes' });
    }
});

// Get all todos
app.get('/todos', async (req, res) => {
    try {
        const userId = getUserId(req);
        const todos = await dbService.getAllEntities(userId, 'todos');

        res.json({ todos });
    } catch (err) {
        console.error('Get todos error:', err);
        res.status(500).json({ error: 'Failed to get todos' });
    }
});

// Create a new todo
app.post('/todos', async (req, res) => {
    try {
        const userId = getUserId(req);
        const { title, description } = req.body;

        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description required' });
        }

        const result = await dbService.addEntity(userId, 'todos', {
            id: Date.now().toString(),
            title,
            description,
            done: false
        });

        res.json({
            success: true,
            todoId: result.entityId,
            todos: result.entities
        });
    } catch (err) {
        console.error('Create todo error:', err);
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

// Update a todo
app.put('/todos/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const todoId = req.params.id;
        const updateData = req.body;

        // Add ID to the update data
        updateData.id = todoId;

        // Update entity
        const doc = await dbService.updateEntity(userId, 'todos', todoId, updateData);

        res.json({
            success: true,
            todos: dbService.extractAllEntities(doc, 'todos')
        });
    } catch (err) {
        console.error('Update todo error:', err);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

// Delete a todo
app.delete('/todos/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const todoId = req.params.id;

        const result = await dbService.deleteEntity(userId, 'todos', todoId);

        res.json({
            success: true,
            todos: result.entities
        });
    } catch (err) {
        console.error('Delete todo error:', err);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

// Debug endpoint - view all entities in the main database
app.get('/debug', async (req, res) => {
    try {
        await dbService.initMainDatabase();
        const records = await dbService.mainTableModel.find({});

        const result = [];
        for (const record of records) {
            try {
                const doc = dbService.loadDocument(record);
                result.push({
                    entityType: record.entityType,
                    data: doc
                });
            } catch (err) {
                result.push({
                    entityType: record.entityType,
                    error: 'Failed to load document'
                });
            }
        }

        res.json(result);
    } catch (err) {
        console.error('Debug error:', err);
        res.status(500).json({ error: 'Failed to retrieve debug information' });
    }
});

// Debug session endpoint - view entities in a specific user session
app.get('/debug/session/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        if (!dbService.sessions.has(userId)) {
            return res.status(404).json({ error: 'Session not found for user' });
        }

        const session = dbService.sessions.get(userId);
        const records = await session.tableModel.find({});

        const result = {
            userId,
            sessionId: session.sessionId,
            lastSyncTime: session.lastSyncTime,
            entities: []
        };

        for (const record of records) {
            try {
                const doc = dbService.loadDocument(record);
                result.entities.push({
                    entityType: record.entityType,
                    data: doc
                });
            } catch (err) {
                result.entities.push({
                    entityType: record.entityType,
                    error: 'Failed to load document'
                });
            }
        }

        res.json(result);
    } catch (err) {
        console.error('Session debug error:', err);
        res.status(500).json({ error: 'Failed to retrieve session debug information' });
    }
});

// Reset database - for testing purposes
app.post('/reset', async (req, res) => {
    try {
        const userId = getUserId(req);

        // Drop all session databases and close connections
        await dbService.dropAllSessionDatabases();

        // Drop main database
        if (dbService.mainConnection) {
            await dbService.mainConnection.dropDatabase();
            // Close the connection
            await dbService.mainConnection.close();
            dbService.mainConnection = null;
        }

        // Re-initialize main database
        await dbService.initMainDatabase();

        // Initialize todos with default data
        let doc = dbService.initAutomergeDocument('todos');
        doc = Automerge.change(doc, 'Initialize default todo', d => {
            d.list = [
                { id: '1', title: 'Buy milk', description: 'Get 2L of milk', done: false }
            ];
        });

        await dbService.saveDocument(
            dbService.mainTableModel,
            'todos',
            doc
        );

        // Create a new session for the requesting user
        const session = await dbService.createUserSession(userId);

        res.json({
            success: true,
            message: 'Database reset successfully',
            sessionId: session.sessionId
        });
    } catch (err) {
        console.error('Reset error:', err);
        res.status(500).json({ error: 'Failed to reset database' });
    }
});

app.post('/pull-updates', async (req, res) => {
    try {
        const { userId } = req.body;

        // Validate userId
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        // Pull updates from main database
        const results = await dbService.pullUpdatesFromMain(userId, []);

        return res.status(200).json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Error pulling updates:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});



// Start server
app.listen(3000, () => console.log('Server running on port 3000'));