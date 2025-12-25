const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Get timetable for a specific day
router.get('/day/:day', authMiddleware, async (req, res) => {
  try {
    const { day } = req.params;
    
    const result = await pool.query(
      `SELECT tt.*, t.name as teacher_name, s.name as subject_name
       FROM timetable tt
       LEFT JOIN teachers t ON tt.teacher_id = t.id
       LEFT JOIN subjects s ON tt.subject_id = s.id
       WHERE tt.day_of_week = $1
       ORDER BY tt.time_slot`,
      [day]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full timetable
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tt.*, t.name as teacher_name, s.name as subject_name
       FROM timetable tt
       LEFT JOIN teachers t ON tt.teacher_id = t.id
       LEFT JOIN subjects s ON tt.subject_id = s.id
       ORDER BY tt.day_of_week, tt.time_slot`
    );
    
    // Group by day for easier frontend consumption
    const groupedByDay = {};
    result.rows.forEach(lesson => {
      if (!groupedByDay[lesson.day_of_week]) {
        groupedByDay[lesson.day_of_week] = [];
      }
      groupedByDay[lesson.day_of_week].push(lesson);
    });
    
    res.json(groupedByDay);
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create/update timetable
router.post('/', [
  authMiddleware,
  adminMiddleware,
  body().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const timetableEntries = req.body;
    
    // Start transaction
    await pool.query('BEGIN');
    
    // Clear existing timetable for these days
    const uniqueDays = [...new Set(timetableEntries.map(entry => entry.day_of_week))];
    for (const day of uniqueDays) {
      await pool.query(
        'DELETE FROM timetable WHERE day_of_week = $1',
        [day]
      );
    }
    
    // Insert new timetable entries
    const insertedEntries = [];
    for (const entry of timetableEntries) {
      const result = await pool.query(
        `INSERT INTO timetable 
         (day_of_week, time_slot, subject_id, teacher_id, is_break, break_description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          entry.day_of_week,
          entry.time_slot,
          entry.subject_id,
          entry.teacher_id,
          entry.is_break || false,
          entry.break_description
        ]
      );
      insertedEntries.push(result.rows[0]);
    }
    
    await pool.query('COMMIT');
    
    res.json(insertedEntries);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error saving timetable:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get timetable statistics
router.get('/statistics', authMiddleware, async (req, res) => {
  try {
    const stats = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE NOT is_break) as total_lessons,
        COUNT(DISTINCT subject_id) as unique_subjects,
        COUNT(DISTINCT teacher_id) as teachers_involved,
        (SELECT json_object_agg(day_of_week, lesson_count)
         FROM (
           SELECT day_of_week, COUNT(*) as lesson_count
           FROM timetable
           WHERE NOT is_break
           GROUP BY day_of_week
         ) day_counts) as lessons_per_day
       FROM timetable
       WHERE NOT is_break`
    );
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching timetable statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
