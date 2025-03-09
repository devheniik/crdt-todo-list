// src/components/Todos.js
import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3000/todos';

export default function Todos({ userId }) {
    const [todos, setTodos] = useState([]);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [loading, setLoading] = useState(false);

    // Set the user ID in the request headers
    const getRequestConfig = () => ({
        headers: { 'user-id': userId }
    });

    const pullUpdates = async () => {
        setLoading(true);
        try {
            await axios.post(
                'http://localhost:3000/pull-updates',
                { userId },
                getRequestConfig()
            );
            // Refresh todos after pulling updates
            await fetchTodos();
        } catch (err) {
            console.error(`Error pulling updates for ${userId}:`, err);
        } finally {
            setLoading(false);
        }
    };


    // Fetch Todos from API
    const fetchTodos = async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_URL, getRequestConfig());
            setTodos(res.data.todos || []);
        } catch (err) {
            console.error(`Error fetching todos for ${userId}:`, err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodos();

        // Set up a polling interval to keep data fresh
        const intervalId = setInterval(fetchTodos, 5000);

        // Clean up interval on component unmount
        return () => clearInterval(intervalId);
    }, [userId]);

    // Add New Todo
    const addTodo = async () => {
        if (!newTitle.trim() || !newDescription.trim()) return;

        setLoading(true);
        try {
            await axios.post(API_URL,
                { title: newTitle, description: newDescription },
                getRequestConfig()
            );
            await fetchTodos();
            setNewTitle('');
            setNewDescription('');
        } catch (err) {
            console.error(`Error adding todo for ${userId}:`, err);
        } finally {
            setLoading(false);
        }
    };

    // Update Todo (always edit both title and description)
    const updateTodo = async (id) => {
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        const newTitle = prompt('Update title', todo.title);
        const newDescription = prompt('Update description', todo.description);

        // Only proceed if user didn't cancel and at least one field has changed
        if (
            (newTitle !== null && newDescription !== null) &&
            (newTitle !== todo.title || newDescription !== todo.description)
        ) {
            // Always send the full object, even if only one field changed
            // The server will recognize which fields actually changed
            const updatedTodo = {
                id: todo.id,
                title: newTitle,
                description: newDescription,
                done: todo.done
            };

            setLoading(true);
            try {
                await axios.put(
                    `${API_URL}/${id}`,
                    updatedTodo,
                    getRequestConfig()
                );
                await fetchTodos();
            } catch (err) {
                console.error(`Error updating todo for ${userId}:`, err);
            } finally {
                setLoading(false);
            }
        }
    };

    // Toggle Todo Completion
    const toggleDone = async (id) => {
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        // Create a full object to send, even though only 'done' is changing
        const updatedTodo = {
            id: todo.id,
            title: todo.title,
            description: todo.description,
            done: !todo.done
        };

        setLoading(true);
        try {
            await axios.put(
                `${API_URL}/${id}`,
                updatedTodo,
                getRequestConfig()
            );
            await fetchTodos();
        } catch (err) {
            console.error(`Error toggling todo for ${userId}:`, err);
        } finally {
            setLoading(false);
        }
    };

    // Delete Todo
    const deleteTodo = async (id) => {
        if (!confirm('Are you sure you want to delete this todo?')) return;

        setLoading(true);
        try {
            await axios.delete(
                `${API_URL}/${id}`,
                getRequestConfig()
            );
            await fetchTodos();
        } catch (err) {
            console.error(`Error deleting todo for ${userId}:`, err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="todos-container">
            <div className="todo-form">
                <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Todo title"
                />
                <input
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    placeholder="Todo description"
                />
                <button onClick={addTodo} disabled={loading}>
                    ➕ Add Todo
                </button>
            </div>

            <div className="todos-actions">
                <button onClick={fetchTodos} disabled={loading}>
                    🔄 Refresh
                </button>
                <button onClick={pullUpdates} disabled={loading}>
                    ⬇️ Pull Updates
                </button>

                {loading && <span className="loading-indicator">Loading...</span>}
            </div>

            <ul className="todos-list">
                {todos.length === 0 ? (
                    <li className="empty-message">No todos yet. Add some!</li>
                ) : (
                    todos.map(todo => (
                        <li key={todo.id} className={`todo-item ${todo.done ? 'completed' : ''}`}>
                            <div className="todo-header">
                                <strong>{todo.title}</strong>
                                <div className="todo-actions">
                                    <button
                                        onClick={() => toggleDone(todo.id)}
                                        className="toggle-button"
                                    >
                                        {todo.done ? '✅' : '⬜'}
                                    </button>
                                    <button onClick={() => deleteTodo(todo.id)}>
                                        🗑️
                                    </button>
                                </div>
                            </div>

                            <p className="todo-description">{todo.description}</p>

                            <div className="edit-buttons">
                                <button onClick={() => updateTodo(todo.id)}>
                                    ✏️ Edit Todo
                                </button>
                            </div>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}