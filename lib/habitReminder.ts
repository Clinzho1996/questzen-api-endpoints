// lib/email/habitReminders.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: parseInt(process.env.SMTP_PORT || "587"),
	secure: false,
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
});

// Enhanced habit reminder email
export async function sendHabitReminderEmail(
	email: string,
	displayName: string,
	habitData: {
		name?: string;
		description?: string;
		category?: string;
		timeOfDay?: string[];
		streak: number;
		completionRate: number;
		habitId: string;
		dueTime?: string;
		isCollaborative?: boolean;
		collaboratorsCount?: number;
	}
) {
	try {
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
		const habitUrl = `${frontendUrl}/habits`;

		// Format due time if provided
		let dueTimeText = "";
		if (habitData.dueTime) {
			const dueDate = new Date(habitData.dueTime);
			dueTimeText = dueDate.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
		}

		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Habit Reminder: ${habitData.name} - QuestZen AI</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6; 
            color: #2d3748; 
            margin: 0;
            padding: 0;
            background-color: #f7fafc;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 28px;
            font-weight: 700;
          }
          .header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 16px;
          }
          .content { 
            padding: 40px 30px; 
          }
          .habit-card {
            background: linear-gradient(135deg, #f6f9fc 0%, #edf2f7 100%);
            border-radius: 12px;
            padding: 25px;
            margin: 25px 0;
            border-left: 4px solid #667eea;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          }
          .habit-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
          }
          .habit-icon {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
          }
          .habit-title {
            font-size: 22px;
            font-weight: 700;
            color: #2d3748;
            margin: 0;
          }
          .habit-category {
            display: inline-block;
            background: #e2e8f0;
            color: #4a5568;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 5px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin: 25px 0;
          }
          .stat-card {
          margin-top:6px;
            background: white;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
          }
          .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 5px;
          }
          .stat-label {
            font-size: 12px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .streak-fire {
            color: #f56565;
          }
          .success-rate {
            color: #48bb78;
          }
          .reminder-time {
            color: #ed8936;
          }
          .button { 
            display: inline-block; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 16px 32px; 
            text-decoration: none; 
            border-radius: 8px; 
            margin: 20px 0; 
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            border: none;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
          }
          .collaboration-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #ebf8ff;
            color: #2b6cb0;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-top: 15px;
          }
          .motivation-quote {
            background: #f7fafc;
            padding: 20px;
            border-radius: 8px;
            margin: 25px 0;
            border-left: 4px solid #ed8936;
            font-style: italic;
            color: #4a5568;
          }
          .footer { 
            text-align: center; 
            margin-top: 40px; 
            color: #718096; 
            font-size: 14px; 
            border-top: 1px solid #e2e8f0;
            padding-top: 30px;
          }
          .time-indicator {
            background: #fff3cd;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f6ad55;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          @media (max-width: 600px) {
            .stats-grid {
              grid-template-columns: 1fr;
            }
            .container {
              border-radius: 0;
            }
            .content {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Habit Reminder</h1>
            <p>QuestZen AI - Stay Consistent</p>
          </div>
          
          <div class="content">
            <h2 style="margin-top: 0;">Hello ${displayName},</h2>
            <p>It's time to work on your habit! Consistency is key to building lasting habits.</p>
            
            <div class="habit-card">
              <div class="habit-header">
                <div class="habit-icon">
                  🔥
                </div>
                <div>
                  <h2 class="habit-title">${habitData.name}</h2>
                  ${
										habitData.category
											? `<span class="habit-category">${habitData.category}</span>`
											: ""
									}
                </div>
              </div>
              
              ${
								habitData.description
									? `<p style="color: #4a5568;">${habitData.description}</p>`
									: ""
							}
              
              ${
								habitData.dueTime
									? `
                <div class="time-indicator">
                  <span style="font-weight: 600; color: #dd6b20;">⏰</span>
                  <div>
                    <p style="margin: 0; font-weight: 600;">Scheduled for: ${dueTimeText}</p>
                    ${
											habitData.timeOfDay?.length
												? `<p style="margin: 5px 0 0; color: #718096; font-size: 14px;">Preferred times: ${habitData.timeOfDay.join(
														", "
												  )}</p>`
												: ""
										}
                  </div>
                </div>
              `
									: ""
							}
              
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-value streak-fire">${
										habitData.streak
									} 🔥</div>
                  <div class="stat-label">Current Streak</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value success-rate">${
										habitData.completionRate
									}%</div>
                  <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value reminder-time">${
										habitData.timeOfDay?.length || 1
									}x/week</div>
                  <div class="stat-label">Frequency</div>
                </div>
              </div>
              
              ${
								habitData.isCollaborative
									? `
                <div class="collaboration-badge">
                  👥 ${habitData.collaboratorsCount || 1} people collaborating
                </div>
              `
									: ""
							}
            </div>
            
            <div class="motivation-quote">
              "We are what we repeatedly do. Excellence, then, is not an act, but a habit." – Aristotle
            </div>
            
            <div style="text-align: center;">
              <a href="${habitUrl}" class="button" style="color: white; text-decoration: none;">
                ✅ Mark as Complete
              </a>
              <p style="color: #718096; font-size: 14px; margin-top: 10px;">
                Or track your progress: <br>${habitUrl}
              </p>
            </div>
            
            <div style="background: #edf2f7; padding: 20px; border-radius: 8px; margin: 30px 0;">
              <h3 style="margin-top: 0; color: #2d3748;">💡 Tips for Success</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Set a specific time for this habit</li>
                <li>Start small - even 5 minutes counts</li>
                <li>Use the Streak Calendar to track consistency</li>
                <li>Celebrate small wins along the way</li>
              </ul>
            </div>
            
            <p style="color: #718096; font-size: 14px;">
              💭 This reminder is sent based on your preferred schedule. 
              You can adjust reminder settings in your habit preferences.
            </p>
          </div>
          
          <div class="footer">
            <p>QuestZen AI · Turn Goals Into Focused Quests</p>
            <p><a href="${frontendUrl}/habits" style="color: #667eea; text-decoration: none;">View All Habits</a></p>
            <p style="font-size: 12px; color: #a0aec0; margin-top: 20px;">
              To stop receiving reminders for this habit, edit notification settings in the app.<br>
              © ${new Date().getFullYear()} QuestZen AI. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

		const text = `
      Habit Reminder: ${habitData.name}
      
      Hello ${displayName},
      
      It's time to work on your habit: "${habitData.name}"
      
      ${habitData.description ? `Description: ${habitData.description}\n` : ""}
      ${habitData.category ? `Category: ${habitData.category}\n` : ""}
      ${habitData.dueTime ? `Scheduled for: ${dueTimeText}\n` : ""}
      
      Stats:
      • Current Streak: ${habitData.streak} days
      • Success Rate: ${habitData.completionRate}%
      • Frequency: ${habitData.timeOfDay?.length || 1} times per week
      
      ${
				habitData.isCollaborative
					? `👥 ${
							habitData.collaboratorsCount || 1
					  } people are collaborating on this habit\n`
					: ""
			}
      
      Mark as complete: ${habitUrl}
      
      Tips for Success:
      1. Set a specific time for this habit
      2. Start small - even 5 minutes counts
      3. Use the Streak Calendar to track consistency
      4. Celebrate small wins along the way
      
      This reminder is sent based on your preferred schedule.
      Adjust reminder settings in your habit preferences.
      
      QuestZen AI · Turn Goals Into Focused Quests
      ${frontendUrl}
      
      © ${new Date().getFullYear()} QuestZen AI. All rights reserved.
    `;

		const info = await transporter.sendMail({
			from:
				process.env.SMTP_FROM ||
				'"QuestZen AI Reminders" <reminders@questzen.app>',
			to: email,
			subject: `⏰ Habit Reminder: ${habitData.name} - Stay Consistent!`,
			html,
			text,
		});

		console.log(
			`✅ Habit reminder email sent to ${email} for habit: ${habitData.name}`
		);
		return info;
	} catch (error) {
		console.error(`❌ Failed to send habit reminder email to ${email}:`, error);
		throw error;
	}
}

// Send streak milestone email
export async function sendStreakMilestoneEmail(
	email: string,
	displayName: string,
	habitData: {
		name: string;
		streak: number;
		milestone: number;
		habitId: string;
	}
) {
	try {
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
		const habitUrl = `${frontendUrl}/habits/${habitData.habitId}`;

		const milestoneText =
			habitData.streak === 7
				? "1 week"
				: habitData.streak === 30
				? "1 month"
				: habitData.streak === 100
				? "100 days"
				: `${habitData.streak} days`;

		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🎉 Streak Milestone - ${habitData.name} - QuestZen AI</title>
        <style>
          /* Similar styles as above with celebration theme */
          .header { 
            background: linear-gradient(135deg, #f6ad55 0%, #ed8936 100%);
          }
          .celebration {
            text-align: center;
            font-size: 48px;
            margin: 30px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Streak Milestone!</h1>
            <p>QuestZen AI - Celebrating Consistency</p>
          </div>
          
          <div class="content">
            <div class="celebration">
              🎊 🏆 🎯
            </div>
            
            <h2 style="text-align: center;">Amazing job, ${displayName}!</h2>
            <p style="text-align: center; font-size: 18px;">
              You've maintained your habit <strong>"${habitData.name}"</strong> for 
              <span style="color: #f56565; font-weight: 700;">${habitData.streak} consecutive days!</span>
            </p>
            
            <div style="background: #fed7d7; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
              <h3 style="margin: 0; color: #742a2a;">🔥 ${milestoneText} STREAK 🔥</h3>
            </div>
            
            <p style="text-align: center;">Keep up the amazing work! Consistency is building your future.</p>
            
            <div style="text-align: center;">
              <a href="${habitUrl}" class="button" style="color: white; text-decoration: none;">
                🎯 Continue Your Streak
              </a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

		await transporter.sendMail({
			from:
				process.env.SMTP_FROM ||
				'"QuestZen AI Achievements" <achievements@questzen.app>',
			to: email,
			subject: `🎉 ${habitData.streak}-Day Streak Milestone: ${habitData.name}!`,
			html,
		});

		console.log(
			`✅ Streak milestone email sent to ${email} for ${habitData.streak} days`
		);
		return true;
	} catch (error) {
		console.error(`❌ Failed to send streak milestone email:`, error);
		throw error;
	}
}
