import mongoose from 'mongoose';
import * as Automerge from '@automerge/automerge';
import { v4 as uuidv4 } from 'uuid';
import deepEqual from 'deep-equal';

class DatabaseService {
    constructor() {
        this.sessions = new Map(); // Store active user sessions
        this.mainConnection = null; // Connection to main database
        this.MAIN_DB_URI = 'mongodb://localhost:27017/crdtMainDatabase';
    }

    // Initialize the main database connection
    async initMainDatabase() {
        if (!this.mainConnection) {
            this.mainConnection = await mongoose.createConnection(this.MAIN_DB_URI);
            this.mainTableModel = this.createTableModel(this.mainConnection);
        }
    }

    // Create MongoDB schema and model for a connection
    createTableModel(connection) {
        const TableSchema = new mongoose.Schema({
            entityType: { type: String, required: true, unique: true },
            crdtData: { type: Buffer, required: true },
        });

        return connection.model('Table', TableSchema);
    }

    // Create a new user session with its own database
    async createUserSession(userId) {
        if (this.sessions.has(userId)) {
            return this.sessions.get(userId);
        }

        // Create a unique session ID
        const sessionId = uuidv4();

        // Create a separate database for this session
        const userDbUri = `mongodb://localhost:27017/crdtUserDb_${sessionId}`;
        const userConnection = await mongoose.createConnection(userDbUri);
        const userTableModel = this.createTableModel(userConnection);

        // Initialize main database if not already done
        await this.initMainDatabase();

        // Clone data from main database to user session
        await this.cloneMainDatabaseToUserSession(this.mainTableModel, userTableModel);

        // Store session info
        const session = {
            userId,
            sessionId,
            connection: userConnection,
            tableModel: userTableModel,
            lastSyncTime: Date.now()
        };

        this.sessions.set(userId, session);
        return session;
    }

    // Clone data from main database to user session database
    async cloneMainDatabaseToUserSession(mainModel, userModel) {
        // Get all entities from main database
        const entities = await mainModel.find({});

        // Clone each entity to user database
        for (const entity of entities) {
            // Use updateOne with upsert instead of create to handle duplicates
            await userModel.updateOne(
                { entityType: entity.entityType },
                {
                    entityType: entity.entityType,
                    crdtData: entity.crdtData
                },
                { upsert: true }
            );
        }
    }

    // Initialize a new Automerge document for a specific entity type
    initAutomergeDocument(entityType) {
        let doc = Automerge.init();

        // Initialize with appropriate structure based on entity type
        if (entityType === 'todos') {
            doc = Automerge.change(doc, 'Initialize todos list', d => {
                d.list = [];
            });
        }
        // Add other entity types as needed

        return doc;
    }

    // Load document from MongoDB into Automerge
    loadDocument(record) {
        if (!record || !record.crdtData) {
            return null;
        }
        return Automerge.load(new Uint8Array(record.crdtData));
    }

    // Save Automerge document to MongoDB
    async saveDocument(model, entityType, doc) {
        const bufferData = Buffer.from(Automerge.save(doc));
        await model.updateOne(
            { entityType },
            { entityType, crdtData: bufferData },
            { upsert: true }
        );
        return doc;
    }

    // Get user session
    async getUserSession(userId) {
        if (!this.sessions.has(userId)) {
            return await this.createUserSession(userId);
        }
        return this.sessions.get(userId);
    }

    // Load entity for a specific user
    async loadEntityForUser(userId, entityType) {
        const session = await this.getUserSession(userId);

        // Find record in user's database
        const record = await session.tableModel.findOne({ entityType });

        if (!record) {
            // If not found in user's database, check main database
            await this.initMainDatabase();
            const mainRecord = await this.mainTableModel.findOne({ entityType });

            if (!mainRecord) {
                // Create new document if it doesn't exist anywhere
                const newDoc = this.initAutomergeDocument(entityType);
                await this.saveDocument(session.tableModel, entityType, newDoc);
                return newDoc;
            }

            // Copy from main to user database
            const doc = this.loadDocument(mainRecord);
            await this.saveDocument(session.tableModel, entityType, doc);
            return doc;
        }

        return this.loadDocument(record);
    }

    // Update entity with smart field detection
    async updateEntity(userId, entityType, itemId, updateData) {
        const session = await this.getUserSession(userId);

        // Load current document
        let doc = await this.loadEntityForUser(userId, entityType);

        // If document is null (shouldn't happen but just in case)
        if (!doc) {
            doc = this.initAutomergeDocument(entityType);
        }

        // Create a copy of the current data for comparison
        const currentItem = doc.list.find(item => item.id === itemId) || {};

        // Detect which fields have actually changed
        const changedFields = this.detectChangedFields(currentItem, updateData);

        // If nothing changed, return the current document
        if (Object.keys(changedFields).length === 0) {
            return doc;
        }

        // Apply only the changed fields using Automerge
        doc = Automerge.change(doc, `Update ${entityType} item ${itemId}`, d => {
            if (entityType === 'todos') {
                const item = d.list.find(item => item.id === itemId);
                if (item) {
                    // Update only changed fields
                    Object.entries(changedFields).forEach(([key, value]) => {
                        item[key] = value;
                    });
                }
            }
            // Add handling for other entity types as needed
        });

        // Save updated document
        await this.saveDocument(session.tableModel, entityType, doc);

        return doc;
    }

    // Detect which fields have actually changed
    detectChangedFields(currentData, updateData) {
        const changedFields = {};

        Object.entries(updateData).forEach(([key, newValue]) => {
            // Skip id field since it shouldn't change
            if (key === 'id') return;

            // If the field doesn't exist or has changed
            if (!currentData.hasOwnProperty(key) || !deepEqual(currentData[key], newValue)) {
                changedFields[key] = newValue;
            }
        });

        return changedFields;
    }

    // Commit changes from user session to main database
    async commitChanges(userId, entityTypes = null) {
        if (!this.sessions.has(userId)) {
            throw new Error('No active session found for user');
        }

        const session = this.sessions.get(userId);
        await this.initMainDatabase();

        // Get all entity types if not specified
        if (!entityTypes) {
            const distinctResults = await session.tableModel.distinct('entityType');
            entityTypes = distinctResults;
        } else if (!Array.isArray(entityTypes)) {
            entityTypes = [entityTypes]; // Convert single entity type to array
        }

        const results = [];

        // Process each entity type
        for (const entityType of entityTypes) {
            const userEntity = await session.tableModel.findOne({ entityType });

            if (userEntity) {
                // Load user version
                const userDoc = this.loadDocument(userEntity);

                // Load main version
                const mainEntity = await this.mainTableModel.findOne({ entityType });

                let mainDoc;

                if (mainEntity) {
                    mainDoc = this.loadDocument(mainEntity);

                    // Merge user changes into main document
                    const mergedDoc = Automerge.merge(mainDoc, userDoc);

                    // Save merged document back to main database
                    await this.saveDocument(
                        this.mainTableModel,
                        entityType,
                        mergedDoc
                    );

                    // Update user's version with the merged document
                    await this.saveDocument(
                        session.tableModel,
                        entityType,
                        mergedDoc
                    );

                    results.push({
                        entityType,
                        status: 'merged'
                    });
                } else {
                    // Entity doesn't exist in main database, just copy it
                    await this.saveDocument(
                        this.mainTableModel,
                        entityType,
                        userDoc
                    );

                    results.push({
                        entityType,
                        status: 'created'
                    });
                }
            }
        }

        // Update session's last sync time
        session.lastSyncTime = Date.now();

        return results;
    }

    // Close a user session and clean up resources
    async closeUserSession(userId) {
        if (this.sessions.has(userId)) {
            const session = this.sessions.get(userId);

            // Close database connection
            await session.connection.close();

            // Remove session from map
            this.sessions.delete(userId);

            return true;
        }

        return false;
    }

    // Get all entities of a specific type for a user
    async getAllEntities(userId, entityType) {
        const doc = await this.loadEntityForUser(userId, entityType);
        return this.extractAllEntities(doc, entityType);
    }

    async getCRDTData(userId, entityType) {
        const session = await this.getUserSession(userId);

        const record = await session.tableModel.findOne({ entityType });

        // const doc = await this.loadEntityForUser(userId, entityType);
        return record;
    }

    // Extract all entities from Automerge document
    extractAllEntities(doc, entityType) {
        if (entityType === 'todos') {
            return doc.list || [];
        }
        // Add handling for other entity types as needed
        return [];
    }

    // Add a new entity
    async addEntity(userId, entityType, itemData) {
        const session = await this.getUserSession(userId);

        // Generate ID if not provided
        if (!itemData.id) {
            itemData.id = Date.now().toString();
        }

        // Load or create document for this entity type
        let doc = await this.loadEntityForUser(userId, entityType);

        // Add the new entity
        doc = Automerge.change(doc, `Add new ${entityType} item`, d => {
            if (entityType === 'todos') {
                d.list.push(itemData);
            }
            // Add handling for other entity types as needed
        });

        // Save updated document
        await this.saveDocument(session.tableModel, entityType, doc);

        return {
            entityId: itemData.id,
            entities: this.extractAllEntities(doc, entityType)
        };
    }

    async dropAllSessionDatabases() {
        // Get all active session IDs
        const sessions = Array.from(this.sessions.values());

        // Close and drop each session database
        for (const session of sessions) {
            if (session.connection) {
                try {
                    await session.connection.dropDatabase();
                    await session.connection.close();
                } catch (err) {
                    console.error(`Error dropping session database for user ${session.userId}:`, err);
                }
            }
        }

        // Clear the sessions map
        this.sessions.clear();
    }

    // Add this method to the DatabaseService class
    async pullUpdatesFromMain(userId) {
        const session = await this.getUserSession(userId);
        await this.initMainDatabase();

        // Get all entity types in the user's database
        const userEntityTypes = await session.tableModel.distinct('entityType');

        for (const entityType of userEntityTypes) {
            // Load user document
            const userRecord = await session.tableModel.findOne({ entityType });
            let userDoc = userRecord ? this.loadDocument(userRecord) : null;

            // Load main document
            const mainRecord = await this.mainTableModel.findOne({ entityType });
            let mainDoc = mainRecord ? this.loadDocument(mainRecord) : null;

            if (!mainDoc) {
                // If main doesn't exist, do nothing
                continue;
            }

            if (!userDoc) {
                // If user document doesn't exist, copy from main
                await this.saveDocument(session.tableModel, entityType, mainDoc);
                continue;
            }

            // Merge main changes into user document
            const mergedDoc = Automerge.merge(userDoc, mainDoc);

            // Save the merged document back to the user's database
            await this.saveDocument(session.tableModel, entityType, mergedDoc);
        }

        // Update last sync time
        session.lastSyncTime = Date.now();
    }


    // Delete an entity
    async deleteEntity(userId, entityType, itemId) {
        const session = await this.getUserSession(userId);

        // Load document
        let doc = await this.loadEntityForUser(userId, entityType);

        // Delete the entity
        doc = Automerge.change(doc, `Delete ${entityType} item ${itemId}`, d => {
            if (entityType === 'todos') {
                const index = d.list.findIndex(item => item.id === itemId);
                if (index !== -1) {
                    d.list.splice(index, 1);
                }
            }
            // Add handling for other entity types as needed
        });

        // Save updated document
        await this.saveDocument(session.tableModel, entityType, doc);

        return {
            success: true,
            entities: this.extractAllEntities(doc, entityType)
        };
    }
}

// Export a singleton instance
export const dbService = new DatabaseService();