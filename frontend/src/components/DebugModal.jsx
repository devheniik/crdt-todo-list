// src/components/DebugModal.js
import React, { useState } from 'react';
import './DebugModal.css';

function DebugModal({ isOpen, data, sessionData, currentTab, onClose, onTabChange }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Database Debug Info</h2>

                <div className="tab-navigation">
                    <button
                        className={currentTab === 'main' ? 'active' : ''}
                        onClick={() => onTabChange('main')}
                    >
                        Main Database
                    </button>
                    <button
                        className={currentTab === 'userA' ? 'active' : ''}
                        onClick={() => onTabChange('userA')}
                    >
                        User A Session
                    </button>
                    <button
                        className={currentTab === 'userB' ? 'active' : ''}
                        onClick={() => onTabChange('userB')}
                    >
                        User B Session
                    </button>
                </div>

                <div className="tab-content">
                    {currentTab === 'main' && (
                        <pre>{data}</pre>
                    )}
                    {(currentTab === 'userA' || currentTab === 'userB') && (
                        <pre>{sessionData}</pre>
                    )}
                </div>

                <button className="close-button" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}

export default DebugModal;