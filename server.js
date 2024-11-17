const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}); 

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database');
});

// Routes
app.get('/api/buses/search', (req, res) => {
  const { from, to, date } = req.query;
  const query = `
    SELECT * FROM buses 
    WHERE from_location = ? 
    AND to_location = ? 
    AND DATE(departure_time) = ?
  `;
  
  db.query(query, [from, to, date], (err, results) => {
    if (err) {
      res.status(500).json({ error: 'Database error' });
      return;
    }
    res.json(results);
  });
});





app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
  
    // Input validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }
  
    try {
      // Check if user exists
      const query = 'SELECT * FROM users WHERE email = ?';
      db.query(query, [email], async (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
  
        if (results.length === 0) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
  
        const user = results[0];
  
        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
  
        // Create JWT token
        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
  
        // Remove password from user object
        delete user.password;
  
        res.json({
          message: 'Login successful',
          token,
          user
        });
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
 
  




  //register
  app.post('/api/auth/register', (req, res) => {
    const { fullName, email, password, phone, gender, dateOfBirth } = req.body;
  
    // Check if email already exists
    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error occurred'
        });
      }
  
      if (results.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
  
      // Hash password
      bcrypt.genSalt(10, (err, salt) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: 'Error processing request'
          });
        }
  
        bcrypt.hash(password, salt, (err, hashedPassword) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: 'Error processing request'
            });
          }
  
          // Insert new user
          const query = `
            INSERT INTO users (full_name, email, password, phone, gender, date_of_birth)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
  
          db.query(
            query,
            [fullName, email, hashedPassword, phone, gender, dateOfBirth],
            (err, result) => {
              if (err) {
                console.error('Registration error:', err);
                return res.status(500).json({
                  success: false,
                  message: 'Registration failed'
                });
              }
  
              res.status(201).json({
                success: true,
                message: 'Registration successful',
                userId: result.insertId
              });
            }
          );
        });
      });
    });
  });




  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
  
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
  
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid token' });
      }
      req.user = user;
      next();
    });
  };
  
  // Get user profile
  app.get('/api/user/profile', authenticateToken, (req, res) => {
    const userId = req.user.id;
  
    db.query(
      'SELECT * FROM users WHERE id = ?',
      [userId],
      (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Error fetching profile' });
        }
  
        if (results.length === 0) {
          return res.status(404).json({ message: 'User not found' });
        }
  
        res.json(results[0]);
      }
    );
  });
  
  // Update user profile
  app.put('/api/user/profile/update', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { full_name, phone, address,updated_at } = req.body;
  
    const updateData = {
      full_name: full_name,
      phone: phone,
      address: address,
      updated_at: new Date()
    };
  
    db.query(
      'UPDATE users SET ? WHERE id = ?',
      [updateData, userId, full_name, phone, address, updated_at],
      (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Error updating profile' });
        }
  
        res.json({ message: 'Profile updated successfully' });
      }
    );
  });
 

  app.post('/api/bookings', (req, res) => {
    const { busId, seats, totalAmount, name, email, phone } = req.body;
    
    // Start transaction
    db.beginTransaction(err => {
      if (err) {
        res.status(500).json({ error: 'Transaction error' });
        return;
      }
  
      // Insert booking
      const bookingQuery = `
        INSERT INTO bookings (bus_id, passenger_name, email, phone, seats, total_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.query(
        bookingQuery, 
        [busId, name, email, phone, seats.join(','), totalAmount],
        (err, result) => {
          if (err) {
            return db.rollback(() => {
              res.status(500).json({ error: 'Booking failed' });
            });
          }
  
          // Update available seats
          const updateSeatsQuery = `
            UPDATE buses 
            SET available_seats = available_seats - ?
            WHERE id = ?
          `;
          
          db.query(updateSeatsQuery, [seats.length, busId], (err) => {
            if (err) {
              return db.rollback(() => {
                res.status(500).json({ error: 'Seat update failed' });
              });
            }
  
            db.commit(err => {
              if (err) {
                return db.rollback(() => {
                  res.status(500).json({ error: 'Commit failed' });
                });
              }
              
              res.json({ 
                success: true, 
                bookingId: result.insertId 
              });
            });
          });
        }
      );
    });
  });


  app.get('/api/my-bookings', (req, res) => {
    const query = `
      SELECT 
        bookings.id,
        bookings.seats,
        bookings.total_amount,
        bookings.booking_date,
        bookings.status,
        buses.name as bus_name,
        buses.from_location,
        buses.to_location,
        buses.departure_time
      FROM bookings
      JOIN buses ON bookings.bus_id = buses.id
      ORDER BY bookings.booking_date DESC
    `;
  
    db.query(query, (error, results) => {
      if (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
        return;
      }
      res.json(results);
    });
  });
  
  // Cancel booking
  app.post('/api/cancel-booking/:id', (req, res) => {
    const bookingId = req.params.id;
  
    db.beginTransaction(err => {
      if (err) {
        res.status(500).json({ error: 'Transaction error' });
        return;
      }
  
      // First get the booking details
      db.query(
        'SELECT * FROM bookings WHERE id = ? AND status = "CONFIRMED"',
        [bookingId],
        (error, results) => {
          if (error || results.length === 0) {
            return db.rollback(() => {
              res.status(404).json({ error: 'Booking not found or already cancelled' });
            });
          }
  
          const booking = results[0];
  
          // Update booking status
          db.query(
            'UPDATE bookings SET status = "CANCELLED" WHERE id = ?',
            [bookingId],
            (error) => {
              if (error) {
                return db.rollback(() => {
                  res.status(500).json({ error: 'Failed to cancel booking' });
                });
              }
  
              // Update bus available seats
              const seatCount = booking.seats.split(',').length;
              db.query(
                'UPDATE buses SET available_seats = available_seats + ? WHERE id = ?',
                [seatCount, booking.bus_id],
                (error) => {
                  if (error) {
                    return db.rollback(() => {
                      res.status(500).json({ error: 'Failed to update seats' });
                    });
                  }
  
                  db.commit(error => {
                    if (error) {
                      return db.rollback(() => {
                        res.status(500).json({ error: 'Failed to commit transaction' });
                      });
                    }
                    res.json({ message: 'Booking cancelled successfully' });
                  });
                }
              );
            }
          );
        }
      );
    });
  });


  










const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

