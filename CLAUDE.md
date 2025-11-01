# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bloom is a 30-second "attention-for-money" daily lottery ritual built with React Native and Expo. Users participate once per day during a fixed 24-hour window (7 AM to 7 AM) to win cash prizes.

**IMPORTANT PIVOT**: The app has pivoted from video-based content creation to a low-friction "proof-of-work" model. All video recording (camera.tsx), video playback (VideoPlayer.tsx), and "Sunday Recap" features are DEPRECATED and scheduled for removal.

## Development Commands

```bash
# Start the development server
npm start

# Run on specific platforms
npm run android
npm run ios
npm run web
```

## Core Architecture

### The "Bloom Day" Fixed Window Logic

The fundamental constraint of the entire app is the 7 AM fixed window:

- **Bloom Day**: 7:00:00 AM to 6:59:59 AM (next day)
- **Bloom Drop**: The event that happens at 7:00 AM when:
  - Yesterday's submission window closes
  - A winner is selected from yesterday's entries
  - Today's submission window opens
  - The app's flow updates to show yesterday's winner

**Window Calculation Pattern** (found in `app/(tabs)/index.tsx:124-134`):

```typescript
const now = new Date();
const windowStart = new Date(now);

// If it's before 7 AM, the window started at 7 AM *yesterday*
if (now.getHours() < 7) {
  windowStart.setDate(now.getDate() - 1);
}

// Set the window start time to 7:00:00 AM
windowStart.setHours(7, 0, 0, 0);
```

Use `.gte('created_at', windowStart.toISOString())` to check if a user has a submission in the current window.

### The State Machine: FLOW_STEPS

The app is a simple state machine (`app/(tabs)/index.tsx:10-20`) that walks users through these steps:

**NEW FLOW (POST-PIVOT)**:
1. `LOCKED_OUT` - Default state for users who played today. Shows "7 am" screen.
2. `SPLASH` - First screen for unlocked users. Shows "BLOOM" text.
3. `REVEAL` - High-intensity animation resolving to "YOU WON!" or "Not Today. Streak: 12"
4. `PAYOUT` - Social proof screen showing "Today's winner is: @username" (no video)
5. `AD_VIDEO` - Single unskippable 6-15 second ad (the "price" of entry)
6. `POLL` - New "proof-of-work": stateful poll component (e.g., "Coffee or Tea?")
7. `RESULTS` - After voting, shows poll results (e.g., "You and 68% chose Coffee")
8. `STREAK` - Final reinforcement screen showing "BLOOM STREAK: 13"
9. Auto-navigates back to `LOCKED_OUT` state ("7 am" screen)

**DEPRECATED FLOW (PRE-PIVOT)**:
- `USER_VIDEO` - REMOVE
- `WIN_LOSE` - REPLACE with `REVEAL`
- `WINNER_VIDEO` - REMOVE (winner shown as @username text only)
- `AD_BUMPER` - REMOVE (consolidated into AD_VIDEO)

### Authentication & Session Management

**AuthProvider Pattern** (`app/_layout.tsx:57-86`):
- `AuthContext` provides `{ session, loading }` globally via `useAuth()` hook
- `useProtectedRoute()` redirects unauthenticated users to `/login`
- Redirects authenticated users away from `/login` and `/signup`
- Session persists via AsyncStorage (configured in `lib/supabase.ts`)

### Supabase Integration

**Client Configuration** (`lib/supabase.ts`):
- Uses AsyncStorage for session persistence
- Requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars
- Auth events are handled in `_layout.tsx` via `supabase.auth.onAuthStateChange()`

**Database Schema** (inferred from queries):
- `profile` table: stores `current_streak` (singular, not "profiles")
- `videos` table: DEPRECATED - scheduled for removal
- `daily_winners` table: stores `date`, `video_id` - will be refactored to store `user_id` and `username`

**Critical Query Patterns**:

1. **Check Lockout Status**:
```typescript
const { data: submissionData } = await supabase
  .from('submissions') // or current table name
  .select('id')
  .eq('user_id', session.user.id)
  .gte('created_at', windowStart.toISOString())
  .limit(1)
  .maybeSingle();

// If submissionData exists, user is locked out
```

2. **Fetch Streak** (use RPC to bypass HTTP cache):
```typescript
const { data: streakData } = await supabase.rpc('get_current_streak');
```

**Why RPC?** SELECT queries use GET requests (cacheable). RPC uses POST requests (non-cacheable). This ensures fresh data on every call, which is critical for real-time streak updates.

3. **Always use `.maybeSingle()`** instead of `.single()`:
   - `.single()` throws PGRST116 error when no rows found
   - `.maybeSingle()` returns `null` when no rows found

### Data Freshness with useFocusEffect

**Critical Pattern** (`app/(tabs)/index.tsx:118-199`):

Use `useFocusEffect` (not `useEffect`) to fetch data when the screen comes into focus:

```typescript
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

useFocusEffect(
  useCallback(() => {
    const fetchData = async () => {
      // Fetch lockout status, streak, winner, etc.
    };
    fetchData();
  }, [session])
);
```

This ensures data is fresh when:
- User navigates back from camera screen
- User returns from background
- User completes the flow and loops back to index

### File Upload Pattern (DEPRECATED - Scheduled for Removal)

The camera.tsx file uses FormData for React Native file uploads:

```typescript
const formData = new FormData();
formData.append('file', {
  uri: video.uri,
  name: 'video.mov',
  type: 'video/mov',
} as any);

await supabase.storage.from('videos').upload(filePath, formData);
```

**DO NOT** use `fetch().blob()` - it's browser-specific and causes `ReferenceError` in React Native.

## Key Technical Constraints

1. **Table name is `profile` (singular)**, not `profiles`. This has caused bugs in the past.

2. **Use RPC calls for non-cacheable operations**. SELECT queries can be cached by HTTP layer.

3. **FormData is required for file uploads in React Native**. The Web `fetch().blob()` API doesn't exist.

4. **TypeScript errors with Supabase joins**: Use type assertions like `(data.videos as any).storage_path` when accessing nested join data.

5. **Prevent lockout bypass**: Set `disabled={currentStep === 'LOCKED_OUT'}` on the root Pressable.

6. **Double-tap gesture**: The app uses a 300ms double-tap delay for advancing through the flow. Some screens (AD_BUMPER, unskippable AD_VIDEO, STREAK) must be blocked from skipping via the bouncer logic in `handlePress()` (lines 201-219).

## Refactoring Roadmap

The immediate priority is to refactor `app/(tabs)/index.tsx` to match the new FLOW_STEPS:

1. Remove all references to `USER_VIDEO`, `WINNER_VIDEO`, `AD_BUMPER`
2. Replace `WIN_LOSE` with `REVEAL` (reuse WinLoseAnimation component, but update text logic)
3. Remove camera.tsx and VideoPlayer.tsx entirely
4. Implement new POLL and RESULTS steps with a stateful poll component
5. Update PAYOUT to show `@username` text instead of video
6. Refactor `daily_winners` table to store `user_id` and `username` instead of `video_id`
7. Remove `videos` table and all video-related Supabase Storage logic

## UI Styling

- **Primary brand color**: `#FFD7B5` (peach/orange)
- **Lockout screen**: Shows "7 am" in 48pt bold white text on `#FFD7B5` background
- **Streak screen**: Shows "BLOOM STREAK" label (28pt) and number (96pt) in white on `#FFD7B5`
- **Debug panel**: Semi-transparent black (`rgba(0,0,0,0.7)`) with white text, positioned at bottom

## Common Pitfalls

1. **Infinite loops**: Do NOT call `router.replace()` from `camera.tsx` after submission. This causes navigation loops. Let the main flow handle navigation.

2. **Stale streak bug**: If streak isn't updating, check if you're using RPC instead of SELECT. SELECT queries are cached.

3. **PGRST116 errors**: Change `.single()` to `.maybeSingle()` in queries that might return zero rows.

4. **Window logic off-by-one errors**: Remember that if `now.getHours() < 7`, the window started *yesterday*. Test at 6:59 AM and 7:01 AM.

5. **Session timing issues**: Wrap all Supabase queries in `if (!session) return;` guards at the top of effects.
