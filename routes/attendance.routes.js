const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Get attendance for a specific week
router.get('/week/:week/:year', authMiddleware, async (req, res) => {
  try {
    const { week, year } = req.params;
    
    const result = await pool.query(
      `SELECT a.*, t.name as teacher_name, tt.day_of_week, tt.time_slot, s.name as subject_name
       FROM attendance a
       JOIN teachers t ON a.teacher_id = t.id
       JOIN timetable tt ON a.timetable_id = tt.id
       LEFT JOIN subjects s ON tt.subject_id = s.id
       WHERE a.week_number = $1 AND a.year = $2
       ORDER BY tt.day_of_week, tt.time_slot`,
      [week, year]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark attendance
router.post('/', [
  authMiddleware,
  body('week_number').isInt({ min: 1, max: 53 }),
  body('year').isInt({ min: 2023, max: 2100 }),
  body('day_of_week').isInt({ min: 0, max: 6 }),
  body('timetable_id').isInt(),
  body('teacher_id').isInt(),
  body('status').isIn(['present', 'absent', 'late', 'partial']),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      week_number,
      year,
      day_of_week,
      timetable_id,
      teacher_id,
      status,
      notes
    } = req.body;
    
    // Check if attendance already exists
    const existing = await pool.query(
      `SELECT id FROM attendance 
       WHERE week_number = $1 AND year = $2 AND day_of_week = $3 
         AND timetable_id = $4 AND teacher_id = $5`,
      [week_number, year, day_of_week, timetable_id, teacher_id]
    );
    
    let result;
    if (existing.rows.length > 0) {
      // Update existing attendance
      result = await pool.query(
        `UPDATE attendance 
         SET status = $1, notes = $2, recorded_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [status, notes, existing.rows[0].id]
      );
    } else {
      // Create new attendance
      result = await pool.query(
        `INSERT INTO attendance 
         (week_number, year, day_of_week, timetable_id, teacher_id, status, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [week_number, year, day_of_week, timetable_id, teacher_id, status, notes, req.user.id]
      );
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get weekly attendance summary
router.get('/summary/:week/:year', authMiddleware, async (req, res) => {
  try {
    const { week, year } = req.params;
    
    const result = await pool.query(
      `SELECT 
        t.id as teacher_id,
        t.name as teacher_name,
        COUNT(a.id) as total_lessons,
        COUNT(a.id) FILTER (WHERE a.status = 'present') as present,
        COUNT(a.id) FILTER (WHERE a.status = 'absent') as absent,
        COUNT(a.id) FILTER (WHERE a.status = 'late') as late,
        COUNT(a.id) FILTER (WHERE a.status = 'partial') as partial,
        ROUND((COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) * 100.0 / 
               NULLIF(COUNT(a.id), 0)), 0) as percentage
       FROM teachers t
       LEFT JOIN attendance a ON t.id = a.teacher_id 
         AND a.week_number = $1 
         AND a.year = $2
       WHERE t.status = 'active'
       GROUP BY t.id, t.name
       ORDER BY t.name`,
      [week, year]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get attendance trends
router.get('/trends/:teacherId', authMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const weeks = 4; // Get last 4 weeks
    
    const result = await pool.query(
      `SELECT 
        week_number,
        year,
        COUNT(*) as total_lessons,
        COUNT(*) FILTER (WHERE status IN ('present', 'late')) as attended,
        ROUND((COUNT(*) FILTER (WHERE status IN ('present', 'late')) * 100.0 / 
               NULLIF(COUNT(*), 0)), 0) as percentage
       FROM attendance
       WHERE teacher_id = $1
       GROUP BY week_number, year
       ORDER BY year DESC, week_number DESC
       LIMIT $2`,
      [teacherId, weeks]
    );
    
    res.json(result.rows.reverse()); // Reverse to show chronological order
  } catch (error) {
    console.error('Error fetching attendance trends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
