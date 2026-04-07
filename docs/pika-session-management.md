# Pika Session Management & Credit Protection

This guide explains how to manage Pika AI sessions and prevent credit drain when you leave meetings.

## 🚨 Problem: Running Out of Credits

Pika AI agents consume credits continuously while active:
- **~1.5 credits per minute** per AI agent
- **~90 credits per hour** per AI agent
- Sessions can run indefinitely if not stopped

## 🛡️ Solutions Implemented

### 1. Manual Session Termination
```bash
# Stop all AI agents for a hearing
DELETE /api/hearings/[hearingId]/ai-participate
```

### 2. Automatic Session Cleanup
```bash
# Force cleanup of expired sessions
POST /api/hearings/[hearingId]/auto-cleanup

# Check session status
GET /api/hearings/[hearingId]/auto-cleanup
```

### 3. Scheduled Cleanup Job
```bash
# Runs every 10 minutes automatically
*/10 * * * * cd /path/to/project && node scripts/cleanup-pika-sessions.mjs
```

## 📋 Session Management Features

### Time Limits
- **Maximum session duration**: 10 minutes
- **Warning threshold**: 8 minutes (80% of max)
- **Auto-cleanup**: Sessions terminated automatically after 10 minutes

### Session Monitoring
- Real-time session status
- Credit usage estimation
- Countdown to auto-cleanup
- Connection status (video/bot)

### Emergency Controls
- Force immediate cleanup
- Stop all sessions manually
- Real-time cost monitoring

## 🔧 Setup Instructions

### 1. Environment Variables
```env
# Required for cleanup script
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Cron Job Setup
```bash
# Edit crontab
crontab -e

# Add this line (runs every 10 minutes)
*/10 * * * * cd /home/powderisdead/Documents/Vyper_projects/DIN-Vercel-fork && node scripts/cleanup-pika-sessions.mjs >> /var/log/pika-cleanup.log 2>&1

# Save and exit
```

### 3. Frontend Integration
Add the SessionMonitor component to your hearing page:

```tsx
import { SessionMonitor } from '@/components/session-monitor';

// In your hearing component
<SessionMonitor
  hearingId={hearingId}
  isActive={hasActiveAI}
  onSessionStart={handleStartAI}
  onSessionStop={handleStopAI}
/>
```

## 🎯 Best Practices

### Before Starting AI Agents
1. **Check your Pika balance** - Ensure you have sufficient credits
2. **Set a timer** - Don't forget about running sessions
3. **Test with short sessions** - Start with 15-30 minute sessions

### During Active Sessions
1. **Monitor the dashboard** - Keep an eye on session duration and costs
2. **Watch for warnings** - Sessions approaching timeout will show warnings
3. **Stop when done** - Don't leave sessions running unnecessarily

### After Meetings
1. **Verify cleanup** - Ensure all sessions are terminated
2. **Check credits used** - Review your Pika credit usage
3. **Review meeting notes** - Auto-generated notes are saved on cleanup

## 🚨 Emergency Procedures

### If Credits Are Draining Fast
1. **Force cleanup immediately**: Use the "Force Cleanup Now" button
2. **Stop all sessions**: Use the DELETE endpoint
3. **Run manual cleanup**: Execute the cleanup script manually
4. **Check for stuck sessions**: Use the status endpoint to find issues

### Manual Cleanup Commands
```bash
# Check active sessions
curl "http://localhost:3000/api/hearings/[hearingId]/auto-cleanup"

# Force cleanup
curl -X POST "http://localhost:3000/api/hearings/[hearingId]/auto-cleanup"

# Stop all AI agents
curl -X DELETE "http://localhost:3000/api/hearings/[hearingId]/ai-participate"
```

## 📊 Cost Estimation

### Credit Usage per Session
| Duration | Credits (1 agent) | Credits (3 agents) |
|----------|------------------|-------------------|
| 5 min    | ~7.5             | ~22.5             |
| 10 min   | ~15              | ~45               |
| 15 min   | ~22.5            | ~67.5             |

### Money Equivalent (assuming $0.01/credit)
| Duration | Cost (1 agent) | Cost (3 agents) |
|----------|----------------|-----------------|
| 5 min    | ~$0.08         | ~$0.23          |
| 10 min   | ~$0.15         | ~$0.45          |
| 15 min   | ~$0.23         | ~$0.68          |

## 🔍 Monitoring & Alerts

### Session Status Indicators
- **Green dot**: Session ready and connected
- **Yellow dot**: Session starting or connecting
- **Red badge**: Near timeout (less than 2 minutes remaining)

### Automatic Actions
- **Warning at 8 minutes**: Visual alert in dashboard
- **Auto-cleanup at 10 minutes**: Automatic session termination
- **Credit protection**: Stops sessions to prevent overdraft

### Log Monitoring
```bash
# View cleanup logs
tail -f /var/log/pika-cleanup.log

# Look for these patterns:
grep "✅ Cleaned up" /var/log/pika-cleanup.log  # Successful cleanups
grep "❌ Failed" /var/log/pika-cleanup.log      # Failed cleanups
grep "credits saved" /var/log/pika-cleanup.log  # Credit savings
```

## 🚀 Advanced Configuration

### Custom Time Limits
Edit `MAX_SESSION_DURATION_MS` in:
- `scripts/cleanup-pika-sessions.mjs`
- `app/api/hearings/[hearingId]/auto-cleanup/route.ts`

### Custom Cleanup Schedule
```bash
# Every 5 minutes (more aggressive)
*/5 * * * * cd /path/to/project && node scripts/cleanup-pika-sessions.mjs

# Every 30 minutes (less frequent)
*/30 * * * * cd /path/to/project && node scripts/cleanup-pika-sessions.mjs
```

### Multiple Environment Support
```env
# Development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## 🆘 Troubleshooting

### Common Issues
1. **Cleanup not working**: Check cron job and environment variables
2. **Sessions stuck**: Use force cleanup or restart the application
3. **Credits still draining**: Verify all sessions are terminated in Pika dashboard

### Debug Commands
```bash
# Check cron jobs
crontab -l

# Test cleanup script manually
node scripts/cleanup-pika-sessions.mjs

# Check Pika balance
curl -H "Authorization: DevKey YOUR_KEY" \
     "https://srkibaanghvsriahb.pika.art/developer/balance"
```

Remember: **Always stop your AI agents when you're done!** The auto-cleanup is a safety net, not a replacement for proper session management.
