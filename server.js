// server.js - Clean version without errors

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Field Tracker API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Check-in route
app.post('/api/attendance/checkin', (req, res) => {
    const { employee_id, latitude, longitude } = req.body;
    
    if (!employee_id) {
        return res.status(400).json({
            success: false,
            message: 'Employee ID is required'
        });
    }
    
    if (!latitude || !longitude) {
        return res.status(400).json({
            success: false,
            message: 'Location is required'
        });
    }
    
    res.json({
        success: true,
        message: 'Check-in recorded successfully',
        data: {
            attendance_id: Math.floor(Math.random() * 10000),
            employee_id: employee_id,
            check_in_time: new Date().toISOString(),
            location: {
                latitude: latitude,
                longitude: longitude
            }
        }
    });
});

// Check-out route
app.post('/api/attendance/checkout', (req, res) => {
    const { employee_id, latitude, longitude } = req.body;
    
    if (!employee_id) {
        return res.status(400).json({
            success: false,
            message: 'Employee ID is required'
        });
    }
    
    if (!latitude || !longitude) {
        return res.status(400).json({
            success: false,
            message: 'Location is required'
        });
    }
    
    res.json({
        success: true,
        message: 'Check-out recorded successfully',
        data: {
            employee_id: employee_id,
            check_out_time: new Date().toISOString(),
            location: {
                latitude: latitude,
                longitude: longitude
            },
            total_hours: 8.5
        }
    });
});

// Get attendance history
app.get('/api/attendance/history/:employee_id', (req, res) => {
    const { employee_id } = req.params;
    
    const mockHistory = [
        {
            date: '2024-01-15',
            check_in_time: '09:00:00',
            check_out_time: '17:30:00',
            total_hours: 8.5,
            location: { latitude: 12.9716, longitude: 77.5946 }
        },
        {
            date: '2024-01-14',
            check_in_time: '09:15:00',
            check_out_time: '17:45:00',
            total_hours: 8.5,
            location: { latitude: 12.9716, longitude: 77.5946 }
        }
    ];
    
    res.json({
        success: true,
        employee_id: employee_id,
        records: mockHistory
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong on the server'
    });
});

// 404 handler - this should be last
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.path
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Open http://localhost:${PORT} in your browser`);
});

module.exports = app;