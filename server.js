// server.js - Azure-optimized version

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();

// Use Azure's provided PORT or fallback to 8000
const PORT = process.env.PORT || 8000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for Azure compatibility
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging for Azure
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check route (Azure App Service expects this)
app.get('/', (req, res) => {
    res.json({
        message: 'Field Tracker API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        port: PORT
    });
});

// Detailed health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        }
    });
});

// API Routes
app.post('/api/attendance/checkin', (req, res) => {
    try {
        const { employee_id, latitude, longitude } = req.body;
        
        // Validate input
        if (!employee_id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required'
            });
        }
        
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location (latitude and longitude) is required'
            });
        }
        
        // Validate coordinates
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates'
            });
        }
        
        // Success response
        const response = {
            success: true,
            message: 'Check-in recorded successfully',
            data: {
                attendance_id: Math.floor(Math.random() * 1000000),
                employee_id: employee_id,
                check_in_time: new Date().toISOString(),
                location: {
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude)
                },
                server_time: new Date().toISOString()
            }
        };
        
        console.log('Check-in successful:', response.data);
        res.json(response);
        
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during check-in'
        });
    }
});

app.post('/api/attendance/checkout', (req, res) => {
    try {
        const { employee_id, latitude, longitude } = req.body;
        
        // Validate input
        if (!employee_id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required'
            });
        }
        
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location (latitude and longitude) is required'
            });
        }
        
        // Validate coordinates
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates'
            });
        }
        
        // Mock calculation of hours worked
        const hoursWorked = Math.round((Math.random() * 4 + 6) * 100) / 100; // 6-10 hours
        
        const response = {
            success: true,
            message: 'Check-out recorded successfully',
            data: {
                employee_id: employee_id,
                check_out_time: new Date().toISOString(),
                location: {
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude)
                },
                total_hours: hoursWorked,
                server_time: new Date().toISOString()
            }
        };
        
        console.log('Check-out successful:', response.data);
        res.json(response);
        
    } catch (error) {
        console.error('Check-out error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during check-out'
        });
    }
});

app.get('/api/attendance/history/:employee_id', (req, res) => {
    try {
        const { employee_id } = req.params;
        
        if (!employee_id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required'
            });
        }
        
        // Mock attendance history
        const mockHistory = [
            {
                id: 1,
                date: '2024-07-10',
                check_in_time: '09:00:00',
                check_out_time: '17:30:00',
                total_hours: 8.5,
                check_in_location: { latitude: 12.9716, longitude: 77.5946 },
                check_out_location: { latitude: 12.9716, longitude: 77.5946 }
            },
            {
                id: 2,
                date: '2024-07-09',
                check_in_time: '09:15:00',
                check_out_time: '17:45:00',
                total_hours: 8.5,
                check_in_location: { latitude: 12.9716, longitude: 77.5946 },
                check_out_location: { latitude: 12.9716, longitude: 77.5946 }
            },
            {
                id: 3,
                date: '2024-07-08',
                check_in_time: '08:45:00',
                check_out_time: '17:15:00',
                total_hours: 8.5,
                check_in_location: { latitude: 12.9716, longitude: 77.5946 },
                check_out_location: { latitude: 12.9716, longitude: 77.5946 }
            }
        ];
        
        const response = {
            success: true,
            employee_id: employee_id,
            record_count: mockHistory.length,
            records: mockHistory
        };
        
        console.log(`History requested for employee: ${employee_id}`);
        res.json(response);
        
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching history'
        });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API test endpoint working',
        timestamp: new Date().toISOString(),
        data: {
            employees: 0,
            attendance_records: 0,
            api_version: '1.0.0'
        }
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong on the server',
        timestamp: new Date().toISOString()
    });
});

// 404 handler - must be last
app.use((req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Field Tracker API started successfully`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`💾 Memory usage:`, process.memoryUsage());
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

module.exports = app;