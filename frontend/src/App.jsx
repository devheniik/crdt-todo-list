// src/App.js
import React, { useState, useEffect } from 'react';
import Todos from './components/Todos';
import DebugModal from './components/DebugModal';
import './App.css';
import axios from 'axios';

function App() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [debugData, setDebugData] = useState('');
    const [sessionData, setSessionData] = useState('');
    const [currentDebugTab, setCurrentDebugTab] = useState('main');
    const [sessions, setSessions] = useState({
        UserA: null,
        UserB: null
    });

    useEffect(() => {
        // Create sessions for both users on initial load
        createSession('UserA');
        createSession('UserB');

        // Cleanup sessions when component unmounts
        return () => {
            closeSession('UserA');
            closeSession('UserB');
        };
    }, []);

    // Create a session for a user
    const createSession = async (userId) => {
        try {
            const res = await axios.post('http://localhost:3000/sessions',
                { userId },
                { headers: { 'user-id': userId } }
            );
            setSessions(prev => ({
                ...prev,
                [userId]: res.data.sessionId
            }));
            console.log(`Session created for ${userId}: ${res.data.sessionId}`);
        } catch (err) {
            console.error(`Error creating session for ${userId}:`, err);
        }
    };

    // Close a session for a user
    const closeSession = async (userId) => {
        try {
            await axios.delete('http://localhost:3000/sessions', {
                headers: { 'user-id': userId }
            });
            setSessions(prev => ({
                ...prev,
                [userId]: null
            }));
            console.log(`Session closed for ${userId}`);
        } catch (err) {
            console.error(`Error closing session for ${userId}:`, err);
        }
    };

    // Commit changes for a user
    const commitChanges = async (userId) => {
        try {
            const res = await axios.post('http://localhost:3000/commit',
                { entityTypes: ['todos'] },
                { headers: { 'user-id': userId } }
            );
            console.log(`Changes committed for ${userId}:`, res.data);
            alert(`${userId}'s changes committed successfully!`);
        } catch (err) {
            console.error(`Error committing changes for ${userId}:`, err);
            alert(`Error committing changes for ${userId}`);
        }
    };

    // Fetch debug data for the main database
    const fetchMainDebugData = async () => {
        try {
            const res = await axios.get('http://localhost:3000/debug');
            setDebugData(JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.error('Error fetching debug data:', err);
            setDebugData('Error fetching debug data');
        }
    };

    // Fetch debug data for a specific user session
    const fetchSessionDebugData = async (userId) => {
        try {
            const res = await axios.get(`http://localhost:3000/debug/session/${userId}`);
            setSessionData(JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.error(`Error fetching session debug data for ${userId}:`, err);
            setSessionData(`Error fetching session data for ${userId}`);
        }
    };

    // Handle tab change in debug modal
    const handleTabChange = (tab) => {
        setCurrentDebugTab(tab);

        if (tab === 'main') {
            fetchMainDebugData();
        } else if (tab === 'userA') {
            fetchSessionDebugData('UserA');
        } else if (tab === 'userB') {
            fetchSessionDebugData('UserB');
        }
    };

    const openModal = () => {
        // Fetch data for the initially selected tab
        handleTabChange('main');
        setIsModalOpen(true);
    };

    const closeModal = () => setIsModalOpen(false);

    // Reset the database via the backend
    const resetDB = async () => {
        try {
            // Close existing sessions first
            await closeSession('UserA');
            await closeSession('UserB');

            const res = await axios.post('http://localhost:3000/reset');
            alert(res.data.message || 'Database reset successful');

            // Create new sessions
            await createSession('UserA');
            await createSession('UserB');

            fetchMainDebugData();
        } catch (err) {
            console.error('Error resetting DB:', err);
            alert('Error resetting DB');
        }
    };

    return (
        <div className="App">
            <header>
                <h1>Multi-User Todos with CRDT</h1>
                <div className="header-buttons">
                    <button onClick={openModal}>View DB</button>
                    <button onClick={resetDB}>Reset DB</button>
                </div>
            </header>
            <div className="split-screen">
                <div className="user-panel">
                    <h2>User A</h2>
                    <div className="session-info">
                        <span>Session: {sessions.UserA ? '✅ Active' : '❌ Inactive'}</span>
                        <button
                            onClick={() => commitChanges('UserA')}
                            disabled={!sessions.UserA}
                        >
                            Commit Changes
                        </button>
                    </div>
                    <Todos userId="UserA" />
                </div>
                <div className="user-panel">
                    <h2>User B</h2>
                    <div className="session-info">
                        <span>Session: {sessions.UserB ? '✅ Active' : '❌ Inactive'}</span>
                        <button
                            onClick={() => commitChanges('UserB')}
                            disabled={!sessions.UserB}
                        >
                            Commit Changes
                        </button>
                    </div>
                    <Todos userId="UserB" />
                </div>
            </div>
            <DebugModal
                isOpen={isModalOpen}
                data={debugData}
                sessionData={sessionData}
                currentTab={currentDebugTab}
                onTabChange={handleTabChange}
                onClose={closeModal}
            />
        </div>
    );
}

export default App;