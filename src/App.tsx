import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit,
  getDocs,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  format, 
  startOfToday, 
  subDays, 
  isSameDay, 
  parseISO, 
  differenceInDays,
  startOfDay,
  addDays,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { 
  Coordinates, 
  CalculationMethod, 
  PrayerTimes, 
  SunnahTimes, 
  Prayer,
  Qibla
} from 'adhan';
import { 
  Flame, 
  CheckCircle2, 
  Circle, 
  LogOut, 
  Calendar as CalendarIcon, 
  Trophy, 
  ChevronLeft, 
  ChevronRight,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  CloudSun,
  Home as HomeIcon,
  Settings as SettingsIcon,
  Medal,
  Plus,
  MapPin,
  Clock,
  Compass,
  Bell,
  Smartphone,
  Globe,
  Sparkles,
  Lock,
  Users,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  currentStreak: number;
  maxStreak: number;
  lastPrayerDate: string | null;
  unlockedMedals: string[];
  tier: string;
  joinedDate: string;
  settings: {
    hapticFeedback: boolean;
    theme: 'light' | 'dark';
    language: string;
    location: {
      name: string;
      latitude: number;
      longitude: number;
    };
    athanAudio: string;
  };
}

interface Achievement {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string;
  type: 'streak' | 'medal' | 'tier';
  value: string;
  timestamp: string;
}

type PrayerStatus = 'none' | 'on-time' | 'late' | 'qada';

interface PrayerLog {
  fajr: PrayerStatus;
  dhuhr: PrayerStatus;
  asr: PrayerStatus;
  maghrib: PrayerStatus;
  isha: PrayerStatus;
  count: number;
  date: string;
}

const PRAYERS = [
  { id: 'fajr', name: 'Fajr', icon: Sunrise },
  { id: 'dhuhr', name: 'Dhuhr', icon: Sun },
  { id: 'asr', name: 'Asr', icon: CloudSun },
  { id: 'maghrib', name: 'Maghrib', icon: Sunset },
  { id: 'isha', name: 'Isha', icon: Moon },
] as const;

type PrayerId = typeof PRAYERS[number]['id'];

// Helper to get prayer times
function getPrayerTimesForDate(date: Date, coords: { latitude: number, longitude: number }) {
  const coordinates = new Coordinates(coords.latitude, coords.longitude);
  const params = CalculationMethod.MuslimWorldLeague();
  const prayerTimes = new PrayerTimes(coordinates, date, params);
  
  return {
    fajr: format(prayerTimes.fajr, 'hh:mm a'),
    dhuhr: format(prayerTimes.dhuhr, 'hh:mm a'),
    asr: format(prayerTimes.asr, 'hh:mm a'),
    maghrib: format(prayerTimes.maghrib, 'hh:mm a'),
    isha: format(prayerTimes.isha, 'hh:mm a'),
    raw: prayerTimes
  };
}

type Page = 'home' | 'tracker' | 'medals' | 'settings' | 'leaderboard' | 'community';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todayLog, setTodayLog] = useState<PrayerLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<Page>('home');

  // Theme application
  useEffect(() => {
    if (profile?.settings?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [profile?.settings?.theme]);

  const todayStr = format(startOfToday(), 'yyyy-MM-dd');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setTodayLog(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Profile & Today's Log Listener
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const logRef = doc(db, 'users', user.uid, 'logs', todayStr);

    const unsubProfile = onSnapshot(userRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        
        // Ensure public profile exists/is in sync
        const profileRef = doc(db, 'profiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          await setDoc(profileRef, {
            uid: user.uid,
            displayName: data.displayName,
            photoURL: data.photoURL,
            maxStreak: data.maxStreak,
            tier: data.tier
          });
        }
      } else {
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'User',
          photoURL: user.photoURL || '',
          currentStreak: 0,
          maxStreak: 0,
          lastPrayerDate: null,
          unlockedMedals: [],
          tier: 'Bronze',
          joinedDate: todayStr,
          settings: {
            hapticFeedback: true,
            theme: 'light',
            language: 'English (US)',
            location: {
              name: 'London, UK',
              latitude: 51.5074,
              longitude: -0.1278
            },
            athanAudio: 'Makkah'
          }
        };
        setDoc(userRef, newProfile);
        // Sync to public profile
        setDoc(doc(db, 'profiles', user.uid), {
          uid: user.uid,
          displayName: newProfile.displayName,
          photoURL: newProfile.photoURL,
          maxStreak: newProfile.maxStreak,
          tier: newProfile.tier
        });
      }
    }, (err) => {
      console.error("Profile listener error:", err);
      setError("Failed to load profile.");
    });

    const unsubLog = onSnapshot(logRef, (docSnap) => {
      if (docSnap.exists()) {
        setTodayLog(docSnap.data() as PrayerLog);
      } else {
        const newLog: PrayerLog = {
          fajr: 'none',
          dhuhr: 'none',
          asr: 'none',
          maghrib: 'none',
          isha: 'none',
          count: 0,
          date: todayStr,
        };
        setDoc(logRef, newLog);
        setTodayLog(newLog);
      }
      setLoading(false);
    }, (err) => {
      console.error("Log listener error:", err);
      setError("Failed to load logs.");
    });

    return () => {
      unsubProfile();
      unsubLog();
    };
  }, [user, todayStr]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed.");
    }
  };

  const handleLogout = () => signOut(auth);

  const postAchievement = async (type: Achievement['type'], value: string) => {
    if (!user || !profile) return;
    try {
      await addDoc(collection(db, 'achievements'), {
        id: crypto.randomUUID(),
        uid: user.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        type,
        value,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Achievement post error:", err);
    }
  };
  
  const updateSettings = async (newSettings: Partial<UserProfile['settings']>) => {
    if (!user || !profile) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, {
        settings: { ...profile.settings, ...newSettings }
      });
    } catch (err) {
      console.error("Settings update error:", err);
    }
  };

  const updatePrayerStatus = async (prayerId: PrayerId, status: PrayerStatus, dateStr: string = todayStr) => {
    if (!user || !profile) return;

    const logRef = doc(db, 'users', user.uid, 'logs', dateStr);
    const userRef = doc(db, 'users', user.uid);

    try {
      // Fetch fresh data to avoid stale state issues
      const [logSnap, userSnap] = await Promise.all([
        getDoc(logRef),
        getDoc(userRef)
      ]);

      if (!userSnap.exists()) return;
      const currentProfile = userSnap.data() as UserProfile;

      let currentLog: PrayerLog;
      if (logSnap.exists()) {
        currentLog = logSnap.data() as PrayerLog;
      } else {
        currentLog = {
          fajr: 'none', dhuhr: 'none', asr: 'none', maghrib: 'none', isha: 'none',
          count: 0, date: dateStr
        };
      }

      const oldStatus = currentLog[prayerId];
      currentLog[prayerId] = status;
      
      // Recalculate count
      const newCount = PRAYERS.reduce((acc, p) => acc + (currentLog[p.id] !== 'none' ? 1 : 0), 0);
      currentLog.count = newCount;

      await setDoc(logRef, currentLog);

      // Streak logic (only for today)
      if (dateStr === todayStr && newCount === 5 && currentProfile.lastPrayerDate !== todayStr) {
        let newStreak = (currentProfile.currentStreak || 0) + 1;
        const lastDate = currentProfile.lastPrayerDate;
        const yesterdayStr = format(subDays(startOfToday(), 1), 'yyyy-MM-dd');

        // If they missed more than a day, streak resets to 1
        if (lastDate && lastDate !== yesterdayStr) {
          newStreak = 1;
        }

        // Tier logic
        let newTier = currentProfile.tier;
        if (newStreak >= 100) newTier = 'Diamond';
        else if (newStreak >= 50) newTier = 'Platinum';
        else if (newStreak >= 30) newTier = 'Gold';
        else if (newStreak >= 15) newTier = 'Silver';
        else newTier = 'Bronze';

        if (newTier !== currentProfile.tier) {
          postAchievement('tier', newTier);
        }

        // Medal logic
        const newUnlockedMedals = [...(currentProfile.unlockedMedals || [])];
        const checkMedal = (id: string, name: string) => {
          if (!newUnlockedMedals.includes(id)) {
            newUnlockedMedals.push(id);
            postAchievement('medal', name);
          }
        };

        if (newStreak >= 10) checkMedal('streak-10', '10 Day Streak');
        if (newStreak >= 30) checkMedal('fajr-warrior', 'Fajr Warrior');
        if (newStreak >= 7) checkMedal('full-week', 'Full Week');
        if (newStreak >= 3) checkMedal('early-bird', 'Early Bird');

        if (newStreak % 10 === 0 || newStreak === 1) {
          postAchievement('streak', `${newStreak} Days`);
        }

        const newMaxStreak = Math.max(newStreak, currentProfile.maxStreak || 0);
        await updateDoc(userRef, {
          currentStreak: newStreak,
          maxStreak: newMaxStreak,
          lastPrayerDate: todayStr,
          tier: newTier,
          unlockedMedals: newUnlockedMedals
        });
        // Sync to public profile
        await updateDoc(doc(db, 'profiles', user.uid), {
          maxStreak: newMaxStreak,
          tier: newTier
        });
      }

      // Haptic feedback
      if (profile?.settings?.hapticFeedback && "vibrate" in navigator) {
        navigator.vibrate(50);
      }
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-salah-bg flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <Sparkles className="w-12 h-12 text-salah-green" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-salah-bg flex flex-col items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-8 max-w-md">
          <div className="relative inline-block">
            <Sparkles className="w-24 h-24 text-salah-green mx-auto" />
          </div>
          <div className="space-y-2">
            <h1 className="text-5xl font-serif font-bold text-salah-green">Salah Streak</h1>
            <p className="text-zinc-500 font-medium">Your spiritual journey starts here.</p>
          </div>
          <button onClick={handleLogin} className="w-full py-4 bg-salah-green text-white font-bold rounded-2xl hover:bg-opacity-90 transition-all shadow-lg">
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-salah-bg pb-32">
      <Header profile={profile} />
      
      <main className="px-6 pt-6">
        <AnimatePresence mode="wait">
          {activePage === 'home' && (
            <HomePage 
              key="home" 
              profile={profile} 
              todayLog={todayLog} 
              onUpdate={updatePrayerStatus} 
              onPageChange={setActivePage}
            />
          )}
          {activePage === 'tracker' && (
            <TrackerPage key="tracker" profile={profile} onUpdate={updatePrayerStatus} />
          )}
          {activePage === 'medals' && (
            <MedalsPage key="medals" profile={profile} />
          )}
          {activePage === 'settings' && (
            <SettingsPage 
              key="settings" 
              profile={profile} 
              onLogout={handleLogout} 
              onUpdateSettings={updateSettings}
            />
          )}
          {activePage === 'leaderboard' && (
            <LeaderboardPage key="leaderboard" />
          )}
          {activePage === 'community' && (
            <CommunityPage key="community" />
          )}
        </AnimatePresence>
      </main>

      <BottomNav activePage={activePage} onPageChange={setActivePage} />
      
      {/* Floating Action Button */}
      {activePage === 'home' && (
        <button className="fixed bottom-24 right-6 w-14 h-14 bg-salah-gold text-salah-green rounded-full shadow-2xl flex items-center justify-center z-40 hover:scale-110 transition-transform">
          <Plus className="w-8 h-8" />
        </button>
      )}
    </div>
  );
}

// --- Components ---

function Header({ profile }: { profile: UserProfile | null }) {
  return (
    <header className="px-6 pt-8 pb-4 flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-salah-green" />
        <h1 className="text-2xl font-serif font-bold text-salah-green">
          {profile?.currentStreak || 0} Day Streak
        </h1>
      </div>
      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-salah-green/10">
        <img src={profile?.photoURL || "https://i.pravatar.cc/150?u=salah"} alt="Profile" className="w-full h-full object-cover" />
      </div>
    </header>
  );
}

function BottomNav({ activePage, onPageChange }: { activePage: Page, onPageChange: (p: Page) => void }) {
  const navItems = [
    { id: 'home', label: 'HOME', icon: HomeIcon },
    { id: 'community', label: 'FEED', icon: Users },
    { id: 'leaderboard', label: 'RANK', icon: Trophy },
    { id: 'medals', label: 'MEDALS', icon: Medal },
    { id: 'settings', label: 'SETTINGS', icon: SettingsIcon },
  ] as const;

  return (
    <nav className="fixed bottom-6 left-4 right-4 bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl border border-zinc-100 p-1.5 grid grid-cols-5 gap-1 z-50">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onPageChange(item.id)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl transition-all duration-300",
            activePage === item.id 
              ? "text-salah-gold bg-salah-green shadow-lg scale-105" 
              : "text-zinc-400 hover:text-salah-green hover:bg-zinc-50"
          )}
        >
          <item.icon className={cn("w-5 h-5", activePage === item.id ? "animate-pulse" : "")} />
          <span className="text-[8px] font-black tracking-widest uppercase">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

// --- Pages ---

function HomePage({ profile, todayLog, onUpdate, onPageChange }: { profile: UserProfile | null, todayLog: PrayerLog | null, onUpdate: (id: PrayerId, status: PrayerStatus) => void, onPageChange: (p: Page) => void }) {
  const prayerTimes = useMemo(() => {
    if (!profile?.settings?.location) return null;
    return getPrayerTimesForDate(new Date(), profile.settings.location);
  }, [profile?.settings?.location]);

  const currentFocus = useMemo(() => {
    if (!prayerTimes) return PRAYERS[1]; // Default to Dhuhr
    const now = new Date();
    const times = prayerTimes.raw;
    
    if (now < times.fajr) return PRAYERS[0];
    if (now < times.dhuhr) return PRAYERS[1];
    if (now < times.asr) return PRAYERS[2];
    if (now < times.maghrib) return PRAYERS[3];
    if (now < times.isha) return PRAYERS[4];
    return PRAYERS[0]; // Next day Fajr
  }, [prayerTimes]);

  const timeRemaining = useMemo(() => {
    if (!prayerTimes) return "42:15";
    const now = new Date();
    const target = prayerTimes.raw[currentFocus.id as keyof PrayerTimes] as Date;
    const diff = target.getTime() - now.getTime();
    if (diff < 0) return "00:00";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, [prayerTimes, currentFocus]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
      {/* Hero Card */}
      <div className="bg-salah-green rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-60">Current Focus</p>
          <h2 className="text-4xl font-serif font-medium">{currentFocus.name} Prayer</h2>
          <div className="flex items-center gap-2 text-sm opacity-80">
            <Clock className="w-4 h-4" />
            <span>Starts in {timeRemaining}</span>
          </div>
          
          <div className="mt-8 bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10 flex items-center gap-6">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                <circle cx="32" cy="32" r="28" fill="transparent" stroke="#FBBF24" strokeWidth="4" strokeDasharray={175} strokeDashoffset={175 * (1 - (profile?.currentStreak ? Math.min(profile.currentStreak / 30, 1) : 0))} strokeLinecap="round" />
              </svg>
              <span className="absolute text-xl font-bold">{profile?.currentStreak || 0}</span>
            </div>
            <div>
              <p className="font-bold text-lg">Day Streak</p>
              <p className="text-xs opacity-60 italic">Alhamdulillah</p>
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Daily Salah Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-serif font-bold text-salah-green">Daily Salah</h3>
            <p className="text-sm text-zinc-500">{format(startOfToday(), 'EEEE, d MMMM')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
            <MapPin className="w-4 h-4" />
            <span className="uppercase">{profile?.settings?.location?.name || 'LONDON, UK'}</span>
          </div>
        </div>

        <div className="space-y-4">
          {PRAYERS.map((prayer) => {
            const status = todayLog?.[prayer.id as keyof PrayerLog] as PrayerStatus || 'none';
            const isCompleted = status !== 'none';
            const prayerTime = prayerTimes ? prayerTimes[prayer.id as keyof typeof prayerTimes] as string : '--:--';
            
            return (
              <div key={prayer.id} className={cn(
                "bg-white rounded-3xl p-5 flex items-center justify-between shadow-sm border-l-4 transition-all",
                isCompleted ? "border-green-500" : "border-salah-gold"
              )}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center">
                    <prayer.icon className="w-6 h-6 text-salah-green" />
                  </div>
                  <div>
                    <p className="font-serif font-bold text-lg">{prayer.name}</p>
                    <p className="text-xs text-zinc-400 font-medium">{prayerTime}</p>
                  </div>
                </div>
                
                {isCompleted ? (
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-500/20">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                ) : (
                  <button 
                    onClick={() => onUpdate(prayer.id, 'on-time')}
                    className="px-4 py-2 border border-zinc-200 rounded-full text-[10px] font-black tracking-widest text-zinc-400 hover:bg-zinc-50 transition-colors"
                  >
                    LOG PRAYER
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#E8F5E9] p-4 rounded-[24px] space-y-2 cursor-pointer" onClick={() => onPageChange('medals')}>
          <Medal className="w-6 h-6 text-green-700" />
          <div>
            <p className="font-serif font-bold text-sm">Medals</p>
            <p className="text-[10px] text-green-700/60 font-medium">{profile?.unlockedMedals?.length || 0} Unlocked</p>
          </div>
        </div>
        <div className="bg-[#FDF5E6] p-4 rounded-[24px] space-y-2 cursor-pointer" onClick={() => onPageChange('tracker')}>
          <Sparkles className="w-6 h-6 text-amber-700" />
          <div>
            <p className="font-serif font-bold text-sm">Progress</p>
            <p className="text-[10px] text-amber-700/60 font-medium">{profile?.tier || 'Bronze'}</p>
          </div>
        </div>
        <div className="bg-[#E3F2FD] p-4 rounded-[24px] space-y-2 cursor-pointer" onClick={() => onPageChange('leaderboard')}>
          <Trophy className="w-6 h-6 text-blue-700" />
          <div>
            <p className="font-serif font-bold text-sm">Ranking</p>
            <p className="text-[10px] text-blue-700/60 font-medium">Top Users</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TrackerPage({ profile, onUpdate }: { profile: UserProfile | null, onUpdate: (id: PrayerId, status: PrayerStatus, date: string) => void }) {
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [selectedLog, setSelectedLog] = useState<PrayerLog | null>(null);

  const weekDays = eachDayOfInterval({
    start: startOfWeek(startOfToday(), { weekStartsOn: 1 }),
    end: endOfWeek(startOfToday(), { weekStartsOn: 1 })
  });

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  useEffect(() => {
    if (!profile) return;
    const logRef = doc(db, 'users', profile.uid, 'logs', dateStr);
    const unsub = onSnapshot(logRef, (snap) => {
      if (snap.exists()) {
        setSelectedLog(snap.data() as PrayerLog);
      } else {
        setSelectedLog(null);
      }
    });
    return unsub;
  }, [profile, dateStr]);

  const prayerTimes = useMemo(() => {
    if (!profile?.settings?.location) return null;
    return getPrayerTimesForDate(selectedDate, profile.settings.location);
  }, [profile?.settings?.location, selectedDate]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-salah-green">Your Journey</h2>
          <p className="text-sm text-zinc-500 italic">{format(selectedDate, 'MMMM yyyy')}</p>
        </div>
        <div className="bg-salah-gold text-salah-green px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg">
          <Trophy className="w-4 h-4" />
          <span>{profile?.tier || 'Bronze'} Tier</span>
        </div>
      </div>

      {/* Weekly Calendar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm">
        {weekDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, startOfToday());
          return (
            <button 
              key={i} 
              onClick={() => setSelectedDate(day)}
              className="flex flex-col items-center gap-3"
            >
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{format(day, 'EEE')}</span>
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold transition-all",
                isSelected ? "bg-salah-gold text-salah-green shadow-lg" : "bg-green-100 text-salah-green",
                isToday && !isSelected && "border-2 border-salah-gold"
              )}>
                {format(day, 'd')}
              </div>
              {isToday && <div className="w-1 h-1 bg-salah-green rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* Detailed Prayer View */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-salah-green" />
          <h3 className="text-xl font-serif font-bold">Daily Salah - {format(selectedDate, 'EEE, d MMM')}</h3>
        </div>

        <div className="space-y-6">
          {PRAYERS.map((prayer) => {
            const status = selectedLog?.[prayer.id as keyof PrayerLog] as PrayerStatus || 'none';
            const prayerTime = prayerTimes ? prayerTimes[prayer.id as keyof typeof prayerTimes] as string : '--:--';
            const isCompleted = status !== 'none';

            return (
              <div key={prayer.id} className="bg-white rounded-[32px] p-6 shadow-sm space-y-6 border border-zinc-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-[0.2em] mb-1",
                      isCompleted ? "text-green-500" : "text-zinc-400"
                    )}>
                      {isCompleted ? String(status).replace('-', ' ') : 'Pending'}
                    </p>
                    <h4 className="text-2xl font-serif font-bold">{prayer.name}</h4>
                    <p className="text-xs text-zinc-400">{prayerTime}</p>
                  </div>
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    isCompleted ? "bg-green-100 text-green-600" : "bg-zinc-100 text-zinc-300"
                  )}>
                    {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['on-time', 'late', 'qada'] as PrayerStatus[]).map((s) => (
                    <button 
                      key={s}
                      onClick={() => onUpdate(prayer.id, s, dateStr)}
                      className={cn(
                        "p-3 rounded-2xl flex flex-col items-center gap-1 transition-all",
                        status === s ? "bg-salah-green text-white shadow-lg" : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100"
                      )}
                    >
                      <Clock className="w-4 h-4" />
                      <span className="text-[10px] font-black tracking-widest uppercase">{String(s).replace('-', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}

function MedalsPage({ profile }: { profile: UserProfile | null }) {
  const medals = [
    { id: 'fajr-warrior', title: 'Fajr Warrior', desc: 'Log 30 consecutive Fajr prayers.', rarity: 'RARE', icon: Sparkles, color: 'gold' },
    { id: 'full-week', title: 'Full Week', desc: 'All 5 prayers for 7 days.', rarity: 'COMMON', icon: CalendarIcon, color: 'green' },
    { id: 'streak-10', title: '10 Day Streak', desc: 'Maintain a 10 day streak.', rarity: 'COMMON', icon: Trophy, color: 'green' },
    { id: 'early-bird', title: 'Early Bird', desc: 'Log all prayers on-time for 3 days.', rarity: 'RARE', icon: Sunrise, color: 'gold' },
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
      {/* Momentum Card */}
      <div className="bg-salah-green rounded-[40px] p-10 text-white text-center relative overflow-hidden shadow-2xl">
        <div className="relative z-10 space-y-6">
          <div className="inline-block px-4 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold tracking-[0.2em] uppercase">
            Current Momentum
          </div>
          <div className="relative w-48 h-48 mx-auto flex flex-col items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="96" cy="96" r="88" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
              <circle cx="96" cy="96" r="88" fill="transparent" stroke="#FBBF24" strokeWidth="6" strokeDasharray={552} strokeDashoffset={552 * (1 - (profile?.currentStreak ? Math.min(profile.currentStreak / 30, 1) : 0))} strokeLinecap="round" />
            </svg>
            <span className="text-7xl font-serif font-bold leading-none">{profile?.currentStreak || 0}</span>
            <span className="text-xs font-bold uppercase tracking-widest opacity-60">Days Strong</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
              <span>Next Milestone: 30 Days</span>
              <span className="text-salah-gold">{30 - (profile?.currentStreak || 0)} Days Left</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-salah-gold" style={{ width: `${Math.min(((profile?.currentStreak || 0) / 30) * 100, 100)}%` }} />
            </div>
          </div>
          <p className="text-sm italic opacity-60">"Verily, with hardship comes ease."</p>
        </div>
      </div>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-serif font-bold text-salah-green">Hall of Medals</h2>
            <p className="text-sm text-zinc-500">Your spiritual milestones earned with grace.</p>
          </div>
          <Medal className="w-8 h-8 text-salah-gold" />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {medals.map((medal) => {
            const isUnlocked = profile?.unlockedMedals?.includes(medal.id) || false;
            return (
              <div key={medal.id} className={cn(
                "bg-white rounded-[32px] p-6 shadow-sm flex items-center gap-6 border border-zinc-100 transition-all",
                !isUnlocked && "opacity-40 grayscale"
              )}>
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0",
                  medal.color === 'gold' ? "bg-salah-gold/20" : "bg-green-100"
                )}>
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center shadow-lg",
                    medal.color === 'gold' ? "bg-salah-gold" : "bg-salah-green"
                  )}>
                    <medal.icon className={cn("w-8 h-8", medal.color === 'gold' ? "text-salah-green" : "text-white")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-serif font-bold">{medal.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{medal.desc}</p>
                  <span className={cn(
                    "inline-block px-3 py-1 rounded-full text-[8px] font-black tracking-widest uppercase",
                    isUnlocked ? (medal.rarity === 'RARE' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700") : "bg-zinc-100 text-zinc-400"
                  )}>
                    {isUnlocked ? `${medal.rarity} ACHIEVEMENT` : 'LOCKED'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}

function SettingsPage({ profile, onLogout, onUpdateSettings }: { profile: UserProfile | null, onLogout: () => void, onUpdateSettings: (s: Partial<UserProfile['settings']>) => void }) {
  const [showQibla, setShowQibla] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  const handleDetectLocation = () => {
    setDetectingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        // In a real app, we'd use reverse geocoding to get the name
        // For now, we'll just use the coordinates
        onUpdateSettings({
          location: {
            name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
            latitude,
            longitude
          }
        });
        setDetectingLocation(false);
      }, (err) => {
        console.error("Location error:", err);
        setDetectingLocation(false);
      });
    } else {
      setDetectingLocation(false);
    }
  };

  const qiblaDirection = useMemo(() => {
    if (!profile?.settings?.location) return 0;
    const coords = new Coordinates(profile.settings.location.latitude, profile.settings.location.longitude);
    return Qibla(coords);
  }, [profile?.settings?.location]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
      <div className="flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-salah-green" />
        <h2 className="text-3xl font-serif font-bold text-salah-green">Settings</h2>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-[40px] p-10 shadow-sm text-center space-y-6 relative overflow-hidden border border-zinc-100">
        <div className="relative inline-block">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-salah-bg shadow-xl">
            <img src={profile?.photoURL || "https://i.pravatar.cc/300"} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <button className="absolute bottom-1 right-1 w-10 h-10 bg-salah-gold rounded-full flex items-center justify-center shadow-lg border-4 border-white">
            <Plus className="w-5 h-5 text-salah-green" />
          </button>
        </div>
        <div>
          <h3 className="text-3xl font-serif font-bold">{profile?.displayName}</h3>
          <p className="text-sm text-zinc-400 font-medium">Spiritual Journeyer since {profile?.joinedDate ? format(parseISO(profile.joinedDate), 'yyyy') : '2023'}</p>
        </div>
        <div className="inline-block px-6 py-2 bg-salah-gold/10 text-salah-gold rounded-full text-[10px] font-black tracking-[0.2em] uppercase">
          🏆 {profile?.currentStreak || 0} Day Streak
        </div>
        <Sparkles className="absolute -top-10 -left-10 w-48 h-48 text-zinc-50 -z-10" />
      </div>

      {/* Settings Sections */}
      <div className="space-y-8">
        <section className="space-y-4">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] px-2">Spiritual Practice</h4>
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-zinc-100 divide-y divide-zinc-50">
            <SettingsItem 
              icon={MapPin} 
              label="Location & Prayer Times" 
              sub={detectingLocation ? "Detecting..." : (profile?.settings?.location?.name || "Automatic")} 
              onClick={handleDetectLocation}
            />
            <SettingsItem 
              icon={Compass} 
              label="Qibla Finder" 
              sub="Precision Compass" 
              onClick={() => setShowQibla(true)}
            />
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center">
                  <Bell className="w-6 h-6 text-salah-green" />
                </div>
                <div>
                  <p className="font-serif font-bold text-lg">Athan Voice</p>
                  <p className="text-xs text-zinc-400">Select your preferred call to prayer</p>
                </div>
              </div>
              <select 
                value={profile?.settings?.athanAudio || 'Makkah'}
                onChange={(e) => onUpdateSettings({ athanAudio: e.target.value })}
                className="bg-zinc-100 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest outline-none"
              >
                <option value="Makkah">Makkah</option>
                <option value="Madinah">Madinah</option>
                <option value="Al-Aqsa">Al-Aqsa</option>
                <option value="Mishary">Mishary Rashid</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] px-2">Awareness</h4>
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-zinc-100 divide-y divide-zinc-50">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-salah-green" />
                </div>
                <div>
                  <p className="font-serif font-bold text-lg">Haptic Feedback</p>
                  <p className="text-xs text-zinc-400">Subtle vibration for logging</p>
                </div>
              </div>
              <button 
                onClick={() => onUpdateSettings({ hapticFeedback: !profile?.settings?.hapticFeedback })}
                className={cn(
                  "w-12 h-6 rounded-full relative p-1 transition-colors",
                  profile?.settings?.hapticFeedback ? "bg-salah-green" : "bg-zinc-200"
                )}
              >
                <motion.div 
                  animate={{ x: profile?.settings?.hapticFeedback ? 24 : 0 }}
                  className="w-4 h-4 bg-white rounded-full shadow-sm" 
                />
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] px-2">Atmosphere</h4>
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-zinc-100 divide-y divide-zinc-50">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center">
                  <Moon className="w-6 h-6 text-salah-green" />
                </div>
                <div>
                  <p className="font-serif font-bold text-lg">Theme</p>
                </div>
              </div>
              <div className="bg-zinc-100 p-1 rounded-xl flex gap-1">
                <button 
                  onClick={() => onUpdateSettings({ theme: 'light' })}
                  className={cn(
                    "px-4 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                    profile?.settings?.theme === 'light' ? "bg-white text-salah-green shadow-sm" : "text-zinc-400"
                  )}
                >
                  Light
                </button>
                <button 
                  onClick={() => onUpdateSettings({ theme: 'dark' })}
                  className={cn(
                    "px-4 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                    profile?.settings?.theme === 'dark' ? "bg-salah-green text-white shadow-sm" : "text-zinc-400"
                  )}
                >
                  Dark
                </button>
              </div>
            </div>
            <SettingsItem icon={Globe} label="Language" sub={profile?.settings?.language || "English (US)"} />
          </div>
        </section>

        <button 
          onClick={onLogout}
          className="w-full py-6 bg-red-50 text-red-600 font-bold rounded-[32px] flex items-center justify-center gap-3 hover:bg-red-100 transition-all border border-red-100"
        >
          <LogOut className="w-6 h-6" />
          Sign Out of Sanctuary
        </button>

        <div className="text-center space-y-1 pb-12">
          <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.4em]">Salah Streak v2.0</p>
          <p className="text-[10px] text-zinc-300 italic">Made with devotion</p>
        </div>
      </div>

      <AnimatePresence>
        {showQibla && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowQibla(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-10 w-full max-w-sm relative z-10 text-center space-y-8"
            >
              <h3 className="text-3xl font-serif font-bold text-salah-green">Qibla Direction</h3>
              <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-zinc-100 rounded-full" />
                <motion.div 
                  animate={{ rotate: qiblaDirection }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  <div className="w-1 h-32 bg-salah-gold rounded-full absolute -top-16" />
                  <div className="w-8 h-8 bg-salah-green rounded-full shadow-lg flex items-center justify-center">
                    <Compass className="w-5 h-5 text-white" />
                  </div>
                </motion.div>
              </div>
              <p className="text-sm text-zinc-500">The Qibla is {qiblaDirection.toFixed(1)}° from North.</p>
              <button 
                onClick={() => setShowQibla(false)}
                className="w-full py-4 bg-salah-green text-white font-bold rounded-2xl"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SettingsItem({ icon: Icon, label, sub, onClick }: { icon: any, label: string, sub: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full p-6 flex items-center justify-between hover:bg-zinc-50 transition-colors group"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center group-hover:bg-white transition-colors">
          <Icon className="w-6 h-6 text-salah-green" />
        </div>
        <div className="text-left">
          <p className="font-serif font-bold text-lg">{label}</p>
          <p className="text-xs text-zinc-400">{sub}</p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-salah-green transition-colors" />
    </button>
  );
}

function CommunityPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'achievements'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Achievement));
      setAchievements(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 pb-12"
    >
      <div className="text-center space-y-2">
        <div className="w-20 h-20 bg-salah-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-10 h-10 text-salah-green" />
        </div>
        <h2 className="text-4xl font-serif font-bold text-salah-green">Community Feed</h2>
        <p className="text-zinc-500 max-w-xs mx-auto">Celebrating the spiritual milestones of our global Ummah.</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="p-12 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-salah-green border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 font-medium">Loading achievements...</p>
          </div>
        ) : achievements.length === 0 ? (
          <div className="bg-white rounded-[40px] p-12 text-center space-y-4 border border-zinc-100">
            <Sparkles className="w-12 h-12 text-zinc-200 mx-auto" />
            <p className="text-zinc-400">No achievements yet. Be the first to share your journey!</p>
          </div>
        ) : (
          achievements.map((achievement) => (
            <motion.div 
              key={achievement.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-[32px] p-6 shadow-sm border border-zinc-100 flex items-center gap-6"
            >
              <div className="relative">
                <img src={achievement.photoURL} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-salah-gold rounded-full flex items-center justify-center shadow-sm">
                  {achievement.type === 'streak' && <Flame className="w-3 h-3 text-salah-green" />}
                  {achievement.type === 'medal' && <Medal className="w-3 h-3 text-salah-green" />}
                  {achievement.type === 'tier' && <Trophy className="w-3 h-3 text-salah-green" />}
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-serif font-bold text-lg">{achievement.displayName}</p>
                  <p className="text-[10px] text-zinc-400 font-medium">{format(parseISO(achievement.timestamp), 'h:mm a')}</p>
                </div>
                <p className="text-sm text-zinc-600">
                  {achievement.type === 'streak' && `Reached a magnificent ${achievement.value} streak!`}
                  {achievement.type === 'medal' && `Unlocked the "${achievement.value}" medal!`}
                  {achievement.type === 'tier' && `Ascended to the ${achievement.value} Tier!`}
                </p>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function LeaderboardPage() {
  const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const q = query(
          collection(db, 'profiles'),
          orderBy('maxStreak', 'desc'),
          limit(10)
        );
        const querySnapshot = await getDocs(q);
        const users = querySnapshot.docs.map(doc => doc.data() as UserProfile);
        setTopUsers(users);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 pb-12"
    >
      <div className="text-center space-y-2">
        <div className="w-20 h-20 bg-salah-gold/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-10 h-10 text-salah-gold" />
        </div>
        <h2 className="text-4xl font-serif font-bold text-salah-green">Global Hall of Fame</h2>
        <p className="text-zinc-500 max-w-xs mx-auto">The most consistent spiritual warriors in our community.</p>
      </div>

      <div className="bg-white rounded-[40px] shadow-xl overflow-hidden border border-zinc-100">
        {loading ? (
          <div className="p-12 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-salah-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 font-medium">Summoning the legends...</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {topUsers.map((user, index) => (
              <div key={user.uid} className="p-6 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-black text-sm",
                    index === 0 ? "bg-salah-gold text-salah-green" : 
                    index === 1 ? "bg-zinc-200 text-zinc-600" :
                    index === 2 ? "bg-amber-100 text-amber-700" : "bg-zinc-50 text-zinc-400"
                  )}>
                    {index + 1}
                  </div>
                  <div className="flex items-center gap-4">
                    <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                    <div>
                      <p className="font-serif font-bold text-lg">{user.displayName}</p>
                      <p className="text-[10px] font-black tracking-widest uppercase text-zinc-400">{user.tier} Tier</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                    <span className="text-2xl font-serif font-bold">{user.maxStreak}</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Best Streak</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-salah-green p-8 rounded-[32px] text-white text-center space-y-4">
        <Sparkles className="w-8 h-8 mx-auto opacity-50" />
        <h3 className="text-xl font-serif font-bold italic">"The most beloved of deeds to Allah are those that are most consistent, even if they are small."</h3>
        <p className="text-xs opacity-60 font-medium">— Prophet Muhammad (ﷺ)</p>
      </div>
    </motion.div>
  );
}
