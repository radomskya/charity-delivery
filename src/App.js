import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getDatabase, ref, set, onValue, get } from 'firebase/database';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyAwCoQ35k6_7068yFZ7SXI3riRsQaq9Pgg",
  authDomain: "charity-delivery.firebaseapp.com",
  databaseURL: "https://charity-delivery-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "charity-delivery",
  storageBucket: "charity-delivery.firebasestorage.app",
  messagingSenderId: "460717648995",
  appId: "1:460717648995:web:26a3747ecde3ae1e0a5c56"
};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  console.log("Firebase initialized successfully!");
} catch (error) {
  console.error("Firebase initialization FAILED:", error);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CharityDeliverySystem() {
  // Authentication
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [userMgmtMsg, setUserMgmtMsg] = useState('');
  const [userMgmtBusy, setUserMgmtBusy] = useState(false);
  const [adminUsers, setAdminUsers] = useState([{ email: 'avner@radomsky.co.uk', lastSeen: null, invitedAt: null }]);
  const [adminUsersError, setAdminUsersError] = useState('');

  // UI Navigation
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = window.localStorage.getItem('activeTab');
      return saved || 'summary';
    } catch (e) {
      return 'summary';
    }
  });
  // Remember the current tab per-device so a refresh returns to where you were.
  useEffect(() => {
    try { window.localStorage.setItem('activeTab', activeTab); } catch (e) {}
  }, [activeTab]);
  // Set the browser tab title.
  useEffect(() => {
    try { document.title = 'BKFG Deliveries'; } catch (e) {}
  }, []);
  const [addressSearch, setAddressSearch] = useState('');
  const [availabilityEditMode, setAvailabilityEditMode] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [editingDriverName, setEditingDriverName] = useState('');
  const [editingDriverPhone, setEditingDriverPhone] = useState('');
  const [editingDriverOriginal, setEditingDriverOriginal] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [geocoding, setGeocoding] = useState(false);

  // Addresses
  const [addresses, setAddresses] = useState({});

  // Anchor Date System
  const [anchorDate, setAnchorDate] = useState('2024-06-06');
  const [anchorWeek, setAnchorWeek] = useState('A');
  const [anchorFirstOfMonth, setAnchorFirstOfMonth] = useState(true);

  // Selected Delivery Date & Type
  const [selectedDate, setSelectedDate] = useState(null);
  const [detectedWeekType, setDetectedWeekType] = useState(null);
  const [detectedFirstOfMonth, setDetectedFirstOfMonth] = useState(false);
  const [deliveryType, setDeliveryType] = useState('single');

  // Calculated totals
  const [calculatedAddresses, setCalculatedAddresses] = useState({});

  // Drivers
  const [drivers, setDrivers] = useState({});
  const [driverPhones, setDriverPhones] = useState({});
  const [driverPreferences, setDriverPreferences] = useState({});

  // Poll system
  const [pollResponses, setPollResponses] = useState({});
  const [allocations, setAllocations] = useState({});
  const [autoAllocated, setAutoAllocated] = useState(false);
  const [pollVotes, setPollVotes] = useState({});
  const [availableDrivers, setAvailableDrivers] = useState({});
  const [proposedAllocation, setProposedAllocation] = useState({});
  const [allocationApproved, setAllocationApproved] = useState(false);

  // Per-week overrides: { 'yyyy-mm-dd': { addressKey: { chicken, meat, pies, excluded } } }
  const [weekOverrides, setWeekOverrides] = useState({});

  // Message customization
  const [pollMessage, setPollMessage] = useState('Hi! Quick question - are you available for delivery on {DATE}? Please vote by {CUTOFF}: {LINK}');
  const [emailTemplate, setEmailTemplate] = useState('');
  const [weekTotals, setWeekTotals] = useState({ chicken: 0, meat: 0, pies: 0 });
  const [broughtForwardTotal, setBroughtForwardTotal] = useState(0);
  const [deliveryHistory, setDeliveryHistory] = useState({});
  const [deliveryMessage, setDeliveryMessage] = useState('📦 DELIVERY LIST FOR {DRIVER}\n📅 Week of: {DATE}\n🚗 Total stops: {STOPS}');
  const [butcherEmailTemplate, setButcherEmailTemplate] = useState('Hi,\n\nPlease prepare the following for collection on {DATE}:\n\n🍗 Chicken: {CHICKEN}\n🍖 Meat: {MEAT}\n🥧 Pies: {PIES}\n\nThank you!');
  const [butcherEmailAddress, setButcherEmailAddress] = useState('');
  const [collectionAddress, setCollectionAddress] = useState('');
  const [collectionLat, setCollectionLat] = useState(null);
  const [collectionLng, setCollectionLng] = useState(null);

  // UI feedback
  const [copiedMessage, setCopiedMessage] = useState('');

  // Poll voting
  const [activePollId, setActivePollId] = useState('');

  // Cutoff & timezone
  const [cutoffDay, setCutoffDay] = useState('thursday');
  const [cutoffHour, setCutoffHour] = useState('08');
  const [cutoffMinute, setCutoffMinute] = useState('00');
  const [forceUKTime, setForceUKTime] = useState(true);

  // ============================================================================
  // FIREBASE AUTH
  // ============================================================================

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    // Safety net: never let the loading screen hang for more than 8 seconds.
    const safety = setTimeout(() => setLoading(false), 8000);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserData(currentUser.uid);
        // shared admin-user list (top-level node, visible to all admins)
        if (db) {
          // record THIS user's login (so others show as "active" once they've signed in)
          if (currentUser.email) {
            get(ref(db, 'adminUsers')).then((snap) => {
              const v = snap.val();
              let arr = [];
              if (v) arr = (Array.isArray(v) ? v : Object.values(v)).map((x) => (typeof x === 'string' ? { email: x, lastSeen: null, invitedAt: null } : x)).filter((x) => x && x.email);
              const meIdx = arr.findIndex((x) => x.email.toLowerCase() === currentUser.email.toLowerCase());
              const nowISO = new Date().toISOString();
              if (meIdx >= 0) { arr[meIdx] = { ...arr[meIdx], lastSeen: nowISO }; }
              else { arr.push({ email: currentUser.email, lastSeen: nowISO, invitedAt: null }); }
              set(ref(db, 'adminUsers'), arr).catch((e) => { console.error('adminUsers write failed (check DB rules for /adminUsers):', e); });
            }).catch(() => {});
          }
          onValue(ref(db, 'adminUsers'), (snap) => {
            setAdminUsersError('');
            const v = snap.val();
            let arr = [];
            if (v) arr = (Array.isArray(v) ? v : Object.values(v)).map((x) => (typeof x === 'string' ? { email: x, lastSeen: null, invitedAt: null } : x)).filter((x) => x && x.email);
            // ensure the main admin is always present
            if (!arr.some((x) => x.email.toLowerCase() === 'avner@radomsky.co.uk')) {
              arr.unshift({ email: 'avner@radomsky.co.uk', lastSeen: null, invitedAt: null });
            }
            // de-dupe by email (keep the one with a lastSeen if any)
            const byEmail = {};
            arr.forEach((x) => {
              const k = x.email.toLowerCase();
              if (!byEmail[k]) byEmail[k] = x;
              else if (x.lastSeen && !byEmail[k].lastSeen) byEmail[k] = x;
            });
            setAdminUsers(Object.values(byEmail));
          }, (err) => {
            console.error('adminUsers read failed (check DB rules for /adminUsers):', err);
            setAdminUsersError('Could not read the shared admin list — your database rules likely don\'t allow access to the "adminUsers" path. See the note below.');
          });
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => { clearTimeout(safety); unsubscribe(); };
  }, []);

  // ============================================================================
  // FIREBASE DATA LOAD/SAVE
  // ============================================================================

  const loadUserData = (userId) => {
    if (!db) {
      setLoading(false);
      return;
    }
    onValue(ref(db, `users/${userId}`), (snapshot) => {
      setLoading(false);
      // Only populate state from Firebase on the FIRST load. Ignoring later fires
      // prevents the live listener from overwriting what the user is currently typing.
      if (hasLoadedOnce.current) return;
      hasLoadedOnce.current = true;
      setDataLoaded(true);
      const data = snapshot.val();
      if (data) {
        setAddresses(data.addresses || {});
        setDrivers(data.drivers || {});
        setDriverPhones(data.driverPhones || {});
        setDriverPreferences(data.driverPreferences || {});
        setAnchorDate(data.anchorDate || '2024-06-06');
        setAnchorWeek(data.anchorWeek || 'A');
        setAnchorFirstOfMonth(data.anchorFirstOfMonth !== false);
        setPollResponses(data.pollResponses || {});
        setPollMessage(data.pollMessage || pollMessage);
        setDeliveryMessage(data.deliveryMessage || deliveryMessage);
        setButcherEmailTemplate(data.butcherEmailTemplate || butcherEmailTemplate);
        setButcherEmailAddress(data.butcherEmailAddress || '');
        setCollectionAddress(data.collectionAddress || '');
        setCollectionLat(typeof data.collectionLat === 'number' ? data.collectionLat : null);
        setCollectionLng(typeof data.collectionLng === 'number' ? data.collectionLng : null);
        setCutoffDay(data.cutoffDay || 'thursday');
        setCutoffHour(data.cutoffHour || '08');
        setCutoffMinute(data.cutoffMinute || '00');
        setForceUKTime(data.forceUKTime !== false);
        setAllocations(data.allocations || {});
        setAutoAllocated(data.autoAllocated || false);
        setProposedAllocation(data.proposedAllocation || {});
        setAllocationApproved(data.allocationApproved || false);
        setAvailableDrivers(data.availableDrivers || {});
        setWeekOverrides(data.weekOverrides || {});
        setActivePollId(data.activePollId || '');
        setBroughtForwardTotal(data.broughtForwardTotal || 0);
        setDeliveryHistory(data.deliveryHistory || {});
        // Restore the selected delivery date and recompute week type
        if (data.selectedDate) {
          setSelectedDate(data.selectedDate);
          setDeliveryType(data.deliveryType || 'single');
          const wk = computeWeekType(data.selectedDate, data.anchorDate || '2024-06-06', data.anchorWeek || 'A');
          const fm = computeFirstOfMonth(data.selectedDate) && (data.anchorFirstOfMonth !== false);
          setDetectedWeekType(wk);
          setDetectedFirstOfMonth(fm);
        }
      }
    });
  };

  const saveData = () => {
    if (!user || !db) return;
    const payload = {
      addresses,
      drivers,
      driverPhones,
      driverPreferences,
      anchorDate,
      anchorWeek,
      anchorFirstOfMonth,
      pollMessage,
      deliveryMessage,
      butcherEmailTemplate,
      butcherEmailAddress: butcherEmailAddress || null,
      collectionAddress: collectionAddress || null,
      collectionLat: collectionLat,
      collectionLng: collectionLng,
      cutoffDay,
      cutoffHour,
      cutoffMinute,
      forceUKTime,
      pollResponses,
      allocations,
      autoAllocated,
      proposedAllocation,
      allocationApproved,
      availableDrivers,
      weekOverrides,
      activePollId: activePollId || null,
      broughtForwardTotal,
      deliveryHistory,
      selectedDate: selectedDate || null,
      deliveryType
    };
    // Firebase set() throws if any value is undefined, which would abort the whole
    // save (losing every field). JSON round-trip strips undefined cleanly.
    let clean;
    try {
      clean = JSON.parse(JSON.stringify(payload));
    } catch (e) {
      clean = payload;
    }
    set(ref(db, `users/${user.uid}`), clean).catch((err) => {
      console.error('Save failed:', err);
    });
  };

  useEffect(() => {
    // Don't save until the initial load from Firebase has completed, otherwise the
    // debounced save could write empty default state over real data (a race on mount).
    if (!dataLoaded) return;
    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [dataLoaded, addresses, drivers, driverPhones, driverPreferences, anchorDate, anchorWeek, anchorFirstOfMonth, pollMessage, deliveryMessage, butcherEmailTemplate, butcherEmailAddress, collectionAddress, collectionLat, collectionLng, cutoffDay, cutoffHour, cutoffMinute, forceUKTime, pollResponses, allocations, autoAllocated, proposedAllocation, allocationApproved, availableDrivers, weekOverrides, activePollId, broughtForwardTotal, deliveryHistory, selectedDate, deliveryType, user]);

  // ============================================================================
  // DATE HELPERS (pure, usable from load before state is set)
  // ============================================================================

  const formatUKDate = (dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Day name -> index (Sun=0)
  const dayNameToIndex = (name) => {
    const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    return map[(name || '').toLowerCase()];
  };

  // Compute the poll cutoff as the most recent {cutoffDay} at {cutoffHour}:{cutoffMinute}
  // at or before the delivery date. Returns a Date (UTC instant) or null.
  const computeCutoff = (deliveryDateStr) => {
    if (!deliveryDateStr) return null;
    const targetDow = dayNameToIndex(cutoffDay);
    if (targetDow == null) return null;
    const [y, m, d] = deliveryDateStr.split('-').map(Number);
    // Delivery date at local midnight
    const base = new Date(y, m - 1, d);
    // Walk back to the most recent matching weekday (0..6 days back)
    let diff = (base.getDay() - targetDow + 7) % 7;
    const cutoffDate = new Date(base);
    cutoffDate.setDate(base.getDate() - diff);
    const hh = parseInt(cutoffHour) || 0;
    const mm = parseInt(cutoffMinute) || 0;
    if (forceUKTime) {
      // Build the cutoff as a UK (Europe/London) wall-clock time, then get the UTC instant.
      // Determine UK offset (GMT/BST) for that date using Intl.
      const yy = cutoffDate.getFullYear();
      const mo = String(cutoffDate.getMonth() + 1).padStart(2, '0');
      const dd = String(cutoffDate.getDate()).padStart(2, '0');
      const hStr = String(hh).padStart(2, '0');
      const mStr = String(mm).padStart(2, '0');
      // Use a probe date to find the London offset in minutes
      const probe = new Date(`${yy}-${mo}-${dd}T${hStr}:${mStr}:00Z`);
      // offsetMinutes = (London wall time - UTC) for the probe
      const utcParts = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
      const londonParts = new Date(probe.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      const offsetMin = Math.round((londonParts - utcParts) / 60000);
      // The desired UK wall-clock instant in UTC = wallclock - offset
      return new Date(Date.UTC(yy, cutoffDate.getMonth(), cutoffDate.getDate(), hh, mm, 0) - offsetMin * 60000);
    }
    // Local time
    cutoffDate.setHours(hh, mm, 0, 0);
    return cutoffDate;
  };

  const formatCutoff = (deliveryDateStr) => {
    const c = computeCutoff(deliveryDateStr);
    if (!c) return '';
    const opts = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false };
    if (forceUKTime) opts.timeZone = 'Europe/London';
    return c.toLocaleString('en-GB', opts);
  };

  const isPollClosed = (deliveryDateStr) => {
    const c = computeCutoff(deliveryDateStr);
    if (!c) return false;
    return new Date() > c;
  };

  const computeWeekType = (date, aDate, aWeek) => {
    if (!aDate) return 'A';
    const anchor = new Date(aDate);
    const selected = new Date(date);
    const daysDiff = Math.floor((selected - anchor) / (1000 * 60 * 60 * 24));
    // Alternate every 7 days from the anchor, straight through month boundaries.
    const weeksSinceAnchor = Math.floor(daysDiff / 7);
    if (aWeek === 'A') {
      return (Math.abs(weeksSinceAnchor) % 2 === 0) ? 'A' : 'B';
    } else {
      return (Math.abs(weeksSinceAnchor) % 2 === 0) ? 'B' : 'A';
    }
  };

  const computeFirstOfMonth = (date) => {
    // First delivery of a calendar month: the delivery date falls within the
    // first 7 days of the month. With weekly deliveries exactly one lands here.
    const d = new Date(date);
    return d.getDate() <= 7;
  };

  const detectWeekType = (date) => computeWeekType(date, anchorDate, anchorWeek);
  const isFirstOfMonth = (date) => computeFirstOfMonth(date);

  const handleDateSelection = (dateString) => {
    setSelectedDate(dateString);
    const detected = detectWeekType(dateString);
    const isFirstMonth = isFirstOfMonth(dateString);
    setDetectedWeekType(detected);
    setDetectedFirstOfMonth(isFirstMonth && anchorFirstOfMonth);
    setDeliveryType('single');
  };

  // ============================================================================
  // ADDRESS HOLD CHECK
  // ============================================================================

  // Returns true if the address is on hold for the given date (yyyy-mm-dd)
  const isOnHold = (address, dateString) => {
    const hold = address.hold;
    if (!hold || !hold.type || hold.type === 'none') return false;
    if (hold.type === 'permanent') return true;
    if (hold.type === 'range') {
      if (!dateString) return false;
      const d = dateString;
      if (hold.from && d < hold.from) return false;
      if (hold.to && d > hold.to) return false;
      return true;
    }
    return false;
  };

  // ============================================================================
  // RULE COMBINING - SINGLE/DOUBLE/TRIPLE
  // ============================================================================

  // Add a number of weeks to a yyyy-mm-dd date string, returning a new yyyy-mm-dd string
  const addWeeksToDate = (dateString, weeks) => {
    const d = new Date(dateString);
    d.setDate(d.getDate() + weeks * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Build the list of covered weeks for a delivery: each entry has the week pattern (A/B)
  // and whether that specific week is a first-of-month delivery.
  const coveredWeeks = (deliveryDate, deliveryTypeSelected) => {
    const count = deliveryTypeSelected === 'triple' ? 3 : (deliveryTypeSelected === 'double' ? 2 : 1);
    const weeks = [];
    for (let i = 0; i < count; i++) {
      const wkDate = addWeeksToDate(deliveryDate, i);
      weeks.push({
        weekType: computeWeekType(wkDate, anchorDate, anchorWeek),
        firstOfMonth: computeFirstOfMonth(wkDate) && anchorFirstOfMonth
      });
    }
    return weeks;
  };

  // How many actual deliveries an address represents for the round: one per covered
  // week where it has any items. A double where the address only has Week-A items = 1;
  // both weeks with items = 2. A triple where only first-of-month qualifies = 1.
  const addressDeliveryCount = (address, deliveryDate, deliveryTypeSelected) => {
    if (!address) return 0;
    const weeks = coveredWeeks(deliveryDate, deliveryTypeSelected);
    let count = 0;
    weeks.forEach((wk) => {
      const base = wk.weekType === 'A' ? address.weekA : address.weekB;
      let c = (base && (base.chicken || base.meat || base.pies)) ? 1 : 0;
      if (wk.firstOfMonth && address.firstOfMonth && (address.firstOfMonth.chicken || address.firstOfMonth.meat || address.firstOfMonth.pies)) {
        c = 1; // qualifies via first-of-month items even if the base week is empty
      }
      count += c;
    });
    return count;
  };

  const combineRules = (address, deliveryDate, deliveryTypeSelected) => {
    if (!address) return { chicken: 0, meat: 0, pies: 0 };
    const addQuantities = (current, toAdd) => ({
      chicken: current.chicken + toAdd.chicken,
      meat: current.meat + toAdd.meat,
      pies: current.pies + toAdd.pies
    });
    let result = { chicken: 0, meat: 0, pies: 0 };
    const weeks = coveredWeeks(deliveryDate, deliveryTypeSelected);
    weeks.forEach((wk) => {
      const base = wk.weekType === 'A' ? address.weekA : address.weekB;
      result = addQuantities(result, base || { chicken: 0, meat: 0, pies: 0 });
      if (wk.firstOfMonth) {
        result = addQuantities(result, address.firstOfMonth || { chicken: 0, meat: 0, pies: 0 });
      }
    });
    return result;
  };

  // ============================================================================
  // CALCULATE ALL ADDRESSES (skips held addresses)
  // ============================================================================

  const calculateAllAddresses = () => {
    if (!selectedDate || !detectedWeekType) return;
    const calculated = {};
    let totalChicken = 0, totalMeat = 0, totalPies = 0;
    const dateOverrides = (weekOverrides && weekOverrides[selectedDate]) || {};
    Object.keys(addresses).forEach((key) => {
      const address = addresses[key];
      if (isOnHold(address, selectedDate)) return; // skip held
      const ov = dateOverrides[key];
      if (ov && ov.excluded) return; // excluded for this week only
      let quantities;
      if (ov && (ov.chicken != null || ov.meat != null || ov.pies != null)) {
        // Per-week override quantities take priority
        const base = combineRules(address, selectedDate, deliveryType);
        quantities = {
          chicken: ov.chicken != null ? parseInt(ov.chicken) || 0 : base.chicken,
          meat: ov.meat != null ? parseInt(ov.meat) || 0 : base.meat,
          pies: ov.pies != null ? parseInt(ov.pies) || 0 : base.pies
        };
      } else {
        quantities = combineRules(address, selectedDate, deliveryType);
      }
      // Nothing to deliver this week -> don't include in the order, allocation, or driver lists.
      if ((quantities.chicken + quantities.meat + quantities.pies) === 0) return;
      calculated[key] = {
        ...quantities,
        notes: address.notes || '',
        fullAddress: address.fullAddress,
        postcode: address.postcode,
        overridden: !!ov && !ov.excluded && (ov.chicken != null || ov.meat != null || ov.pies != null)
      };
      totalChicken += quantities.chicken;
      totalMeat += quantities.meat;
      totalPies += quantities.pies;
    });
    setCalculatedAddresses(calculated);
    setWeekTotals({ chicken: totalChicken, meat: totalMeat, pies: totalPies });
    const emailContent = butcherEmailTemplate
      .replace(/\{DATE\}/g, formatUKDate(selectedDate))
      .replace(/\{CHICKEN\}/g, totalChicken)
      .replace(/\{MEAT\}/g, totalMeat)
      .replace(/\{PIES\}/g, totalPies);
    setEmailTemplate(emailContent);
  };

  useEffect(() => {
    calculateAllAddresses();
  }, [selectedDate, deliveryType, detectedWeekType, detectedFirstOfMonth, addresses, weekOverrides]);

  // ============================================================================
  // HTML TABLE GENERATION
  // ============================================================================

  const generateHTMLTable = () => {
    const driverName = "DRIVER_NAME";
    const dateStr = selectedDate || new Date().toISOString().split('T')[0];
    const addresses_array = Object.entries(calculatedAddresses);
    const headerText = deliveryMessage
      .replace(/\{DRIVER\}/g, driverName)
      .replace(/\{DATE\}/g, formatUKDate(dateStr))
      .replace(/\{STOPS\}/g, addresses_array.length);
    const headerHTML = headerText.split('\n').map(line => `<p style="margin: 5px 0; color: #333; font-weight: bold;">${line}</p>`).join('');
    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; background: white; max-width: 600px;">
  ${headerHTML}
  <hr style="border: none; border-top: 2px solid #ddd; margin: 15px 0;">
  <table style="width: 100%; border-collapse: collapse;">
    <tr style="background: #f0f0f0;">
      <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd; border-bottom: 2px solid #333;">Address</th>
      <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd; border-bottom: 2px solid #333;">🍗</th>
      <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd; border-bottom: 2px solid #333;">🍖</th>
      <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd; border-bottom: 2px solid #333;">🥧</th>
      <th style="padding: 10px; text-align: left; border-bottom: 2px solid #333;">Notes</th>
    </tr>
    ${addresses_array.map(([key, addr]) => `
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 10px; border-right: 1px solid #ddd;"><strong style="color: #333;">${addr.fullAddress}</strong></td>
      <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd; font-weight: bold;">${addr.chicken}</td>
      <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd; font-weight: bold;">${addr.meat}</td>
      <td style="padding: 10px; text-align: center; border-right: 1px solid #ddd; font-weight: bold;">${addr.pies}</td>
      <td style="padding: 10px; font-size: 12px; color: #555;">${addr.notes}</td>
    </tr>
    `).join('')}
  </table>
  <hr style="border: none; border-top: 2px solid #ddd; margin: 15px 0;">
  <p style="text-align: center; color: #666; font-size: 12px;">Professional Delivery Coordination</p>
</div>
    `;
    return html;
  };

  // ============================================================================
  // GEOCODING (postcodes.io - free UK postcode lookup)
  // ============================================================================

  const geocodePostcode = async (postcode) => {
    if (!postcode) return null;
    try {
      const clean = postcode.trim().replace(/\s+/g, '');
      const resp = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
      if (!resp.ok) return null;
      const json = await resp.json();
      if (json && json.result && typeof json.result.latitude === 'number') {
        return { lat: json.result.latitude, lng: json.result.longitude };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // ============================================================================
  // ADDRESS MANAGEMENT (with edit, geocode, hold)
  // ============================================================================

  const startAddAddress = () => {
    setEditingAddress({ originalKey: null, hold: { type: 'none', from: '', to: '' }, preferredDriver: '', avoidDrivers: [] });
    setShowAddAddress(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const startEditAddress = (key) => {
    const a = addresses[key];
    setEditingAddress({
      originalKey: key,
      fullAddress: a.fullAddress,
      postcode: a.postcode,
      weekAChicken: a.weekA?.chicken || 0,
      weekAMeat: a.weekA?.meat || 0,
      weekAPies: a.weekA?.pies || 0,
      weekBChicken: a.weekB?.chicken || 0,
      weekBMeat: a.weekB?.meat || 0,
      weekBPies: a.weekB?.pies || 0,
      firstOfMonthChicken: a.firstOfMonth?.chicken || 0,
      firstOfMonthMeat: a.firstOfMonth?.meat || 0,
      firstOfMonthPies: a.firstOfMonth?.pies || 0,
      name: a.name || '',
      adults: a.adults || 0,
      children: a.children || 0,
      notes: a.notes || '',
      lat: a.lat != null ? a.lat : '',
      lng: a.lng != null ? a.lng : '',
      originalPostcode: a.postcode || '',
      originalLat: a.lat != null ? a.lat : '',
      originalLng: a.lng != null ? a.lng : '',
      hold: a.hold || { type: 'none', from: '', to: '' },
      preferredDriver: a.preferredDriver || '',
      avoidDrivers: a.avoidDrivers || []
    });
    setShowAddAddress(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const addOrUpdateAddress = async () => {
    if (!editingAddress?.fullAddress || !editingAddress?.postcode) {
      alert('Please fill in address and postcode');
      return;
    }
    const key = editingAddress.fullAddress;

    // Determine coordinates: use manual if provided, else geocode
    let lat = editingAddress.lat;
    let lng = editingAddress.lng;
    let needsLocation = false;

    // Did the user change the postcode but leave the lat/lng as they were? Then the old
    // coordinates are stale — force a fresh geocode of the new postcode rather than keeping
    // the previous location.
    const postcodeChanged = (editingAddress.originalPostcode || '') !== (editingAddress.postcode || '');
    const coordsUntouched = (String(lat) === String(editingAddress.originalLat) && String(lng) === String(editingAddress.originalLng));
    const forceRegeocode = postcodeChanged && coordsUntouched;

    const hasManual = !forceRegeocode && (lat !== '' && lat != null && !isNaN(parseFloat(lat)) && lng !== '' && lng != null && !isNaN(parseFloat(lng)));

    if (hasManual) {
      lat = parseFloat(lat);
      lng = parseFloat(lng);
    } else {
      setGeocoding(true);
      const coords = await geocodePostcode(editingAddress.postcode);
      setGeocoding(false);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      } else {
        lat = null;
        lng = null;
        needsLocation = true;
      }
    }

    const newAddress = {
      fullAddress: editingAddress.fullAddress,
      postcode: editingAddress.postcode,
      weekA: {
        chicken: parseInt(editingAddress.weekAChicken) || 0,
        meat: parseInt(editingAddress.weekAMeat) || 0,
        pies: parseInt(editingAddress.weekAPies) || 0
      },
      weekB: {
        chicken: parseInt(editingAddress.weekBChicken) || 0,
        meat: parseInt(editingAddress.weekBMeat) || 0,
        pies: parseInt(editingAddress.weekBPies) || 0
      },
      firstOfMonth: {
        chicken: parseInt(editingAddress.firstOfMonthChicken) || 0,
        meat: parseInt(editingAddress.firstOfMonthMeat) || 0,
        pies: parseInt(editingAddress.firstOfMonthPies) || 0
      },
      name: editingAddress.name || '',
      adults: parseInt(editingAddress.adults) || 0,
      children: parseInt(editingAddress.children) || 0,
      notes: editingAddress.notes || '',
      lat: lat,
      lng: lng,
      needsLocation: needsLocation,
      hold: editingAddress.hold || { type: 'none', from: '', to: '' },
      preferredDriver: editingAddress.preferredDriver || '',
      avoidDrivers: editingAddress.avoidDrivers || []
    };

    const newAddresses = { ...addresses };
    // If editing and the address text changed, remove the old key AND migrate every
    // reference to it (allocation, proposed allocation, week overrides) to the new key —
    // otherwise the renamed address looks "lost" from the allocation and shows zero orders.
    const oldKey = editingAddress.originalKey;
    if (oldKey && oldKey !== key) {
      delete newAddresses[oldKey];

      // migrate approved/locked allocation
      if (allocations && typeof allocations === 'object') {
        const migrated = {};
        let changed = false;
        Object.keys(allocations).forEach((driver) => {
          const list = allocations[driver];
          if (Array.isArray(list)) {
            migrated[driver] = list.map((k) => { if (k === oldKey) { changed = true; return key; } return k; });
          } else { migrated[driver] = list; }
        });
        if (changed) setAllocations(migrated);
      }
      // migrate the in-progress proposed allocation
      if (proposedAllocation && typeof proposedAllocation === 'object') {
        const migratedP = {};
        let changedP = false;
        Object.keys(proposedAllocation).forEach((driver) => {
          const list = proposedAllocation[driver];
          if (Array.isArray(list)) {
            migratedP[driver] = list.map((k) => { if (k === oldKey) { changedP = true; return key; } return k; });
          } else { migratedP[driver] = list; }
        });
        if (changedP) setProposedAllocation(migratedP);
      }
      // migrate per-date week overrides (excluded / one-off quantities)
      if (weekOverrides && typeof weekOverrides === 'object') {
        const migratedW = JSON.parse(JSON.stringify(weekOverrides));
        let changedW = false;
        Object.keys(migratedW).forEach((dateStr) => {
          if (migratedW[dateStr] && migratedW[dateStr][oldKey] !== undefined) {
            migratedW[dateStr][key] = migratedW[dateStr][oldKey];
            delete migratedW[dateStr][oldKey];
            changedW = true;
          }
        });
        if (changedW) setWeekOverrides(migratedW);
      }
    }
    newAddresses[key] = newAddress;
    setAddresses(newAddresses);

    if (needsLocation) {
      alert('Saved, but the postcode could not be located automatically. You can add coordinates manually by editing this address (right-click the spot in Google Maps to get lat/lng).');
    }

    setEditingAddress(null);
    setShowAddAddress(false);
  };

  const deleteAddress = (key) => {
    if (window.confirm(`Delete ${key}?`)) {
      const newAddresses = { ...addresses };
      delete newAddresses[key];
      setAddresses(newAddresses);
    }
  };

  // Re-geocode a single address that needs location
  const locateAddress = async (key) => {
    const a = addresses[key];
    setGeocoding(true);
    const coords = await geocodePostcode(a.postcode);
    setGeocoding(false);
    if (coords) {
      setAddresses({ ...addresses, [key]: { ...a, lat: coords.lat, lng: coords.lng, needsLocation: false } });
    } else {
      alert('Still could not locate this postcode. Please edit the address and enter coordinates manually.');
    }
  };

  const locateCollectionPoint = async () => {
    if (!collectionAddress.trim()) { alert('Enter the collection point postcode first.'); return; }
    setGeocoding(true);
    const coords = await geocodePostcode(collectionAddress);
    setGeocoding(false);
    if (coords) {
      setCollectionLat(coords.lat);
      setCollectionLng(coords.lng);
      alert('Collection point located. Routes will now start from the delivery nearest here.');
    } else {
      alert('Could not locate that postcode. Please check it and try again.');
    }
  };

  // ============================================================================
  // DRIVER MANAGEMENT (with edit)
  // ============================================================================

  const startAddDriver = () => {
    setEditingDriverOriginal(null);
    setEditingDriverName('');
    setEditingDriverPhone('');
    setShowAddDriver(true);
  };

  const startEditDriver = (name) => {
    setEditingDriverOriginal(name);
    setEditingDriverName(name);
    setEditingDriverPhone(driverPhones[name] || '');
    setShowAddDriver(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const addOrUpdateDriver = () => {
    if (!editingDriverName.trim()) {
      alert('Please enter a driver name');
      return;
    }
    const name = editingDriverName.trim();
    const newDrivers = { ...drivers };
    const newPhones = { ...driverPhones };
    // If renaming, remove the old entry
    if (editingDriverOriginal && editingDriverOriginal !== name) {
      delete newDrivers[editingDriverOriginal];
      delete newPhones[editingDriverOriginal];
    }
    newDrivers[name] = true;
    newPhones[name] = editingDriverPhone.trim();
    setDrivers(newDrivers);
    setDriverPhones(newPhones);

    // If renaming, update every address that referenced the old driver name so the
    // preferred/avoid settings are retained (they're stored by name on each address).
    let migratedAddresses = null;
    if (editingDriverOriginal && editingDriverOriginal !== name) {
      const updated = {};
      let changed = false;
      Object.keys(addresses).forEach((key) => {
        const a = addresses[key];
        let na = a;
        if (a.preferredDriver === editingDriverOriginal) {
          na = { ...na, preferredDriver: name }; changed = true;
        }
        if (Array.isArray(a.avoidDrivers) && a.avoidDrivers.includes(editingDriverOriginal)) {
          na = { ...na, avoidDrivers: na.avoidDrivers.map(d => d === editingDriverOriginal ? name : d) }; changed = true;
        }
        updated[key] = na;
      });
      if (changed) {
        migratedAddresses = updated;
        setAddresses(updated);
      }
    }

    // Write immediately to Firebase (don't rely on the debounced save) so the poll
    // roster always has the latest drivers and numbers.
    if (user && db) {
      set(ref(db, `users/${user.uid}/drivers`), newDrivers).catch((e) => console.error('driver save', e));
      set(ref(db, `users/${user.uid}/driverPhones`), newPhones).catch((e) => console.error('phone save', e));
      if (migratedAddresses) {
        set(ref(db, `users/${user.uid}/addresses`), JSON.parse(JSON.stringify(migratedAddresses))).catch((e) => console.error('address migrate', e));
      }
    }
    updateActivePollRoster(newDrivers, newPhones);
    setEditingDriverName('');
    setEditingDriverPhone('');
    setEditingDriverOriginal(null);
    setShowAddDriver(false);
  };

  const deleteDriver = (name) => {
    if (window.confirm(`Delete driver ${name}?`)) {
      const newDrivers = { ...drivers };
      delete newDrivers[name];
      setDrivers(newDrivers);
      const newPhones = { ...driverPhones };
      delete newPhones[name];
      setDriverPhones(newPhones);

      // Remove this driver from any address preferred/avoid settings so nothing
      // references a driver that no longer exists.
      const updated = {};
      let changed = false;
      Object.keys(addresses).forEach((key) => {
        const a = addresses[key];
        let na = a;
        if (a.preferredDriver === name) { na = { ...na, preferredDriver: '' }; changed = true; }
        if (Array.isArray(a.avoidDrivers) && a.avoidDrivers.includes(name)) {
          na = { ...na, avoidDrivers: na.avoidDrivers.filter(d => d !== name) }; changed = true;
        }
        updated[key] = na;
      });
      if (changed) setAddresses(updated);

      if (user && db) {
        set(ref(db, `users/${user.uid}/drivers`), newDrivers).catch((e) => console.error('driver save', e));
        set(ref(db, `users/${user.uid}/driverPhones`), newPhones).catch((e) => console.error('phone save', e));
        if (changed) set(ref(db, `users/${user.uid}/addresses`), JSON.parse(JSON.stringify(updated))).catch((e) => console.error('address cleanup', e));
      }
      updateActivePollRoster(newDrivers, newPhones);
    }
  };

  // ============================================================================
  // POLL VOTING
  // ============================================================================

  const normalisePhone = (phone) => {
    let digits = (phone || '').replace(/\D/g, '');
    if (digits.startsWith('44')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
  };

  const hashPhone = (phone) => {
    const normalised = normalisePhone(phone);
    let hash = 5381;
    for (let i = 0; i < normalised.length; i++) {
      hash = ((hash << 5) + hash + normalised.charCodeAt(i)) >>> 0;
    }
    return 'p' + hash.toString(16);
  };

  // Build the roster (phone-hash -> driver name) from a given drivers/phones set.
  const buildRoster = (driversObj, phonesObj) => {
    const roster = {};
    Object.keys(driversObj).forEach((name) => {
      const phone = phonesObj[name];
      if (phone && normalisePhone(phone)) roster[hashPhone(phone)] = name;
    });
    return roster;
  };

  // Keep the live poll's roster in sync so the SAME poll link works after driver changes.
  const updateActivePollRoster = (driversObj, phonesObj) => {
    if (!activePollId || !db) return;
    const roster = buildRoster(driversObj, phonesObj);
    set(ref(db, `polls/${activePollId}/roster`), roster).catch((e) => console.error('roster sync', e));
  };

  const openPollForVoting = () => {
    if (!selectedDate) {
      alert('Pick a delivery date first (in the Poll tab).');
      return;
    }
    if (Object.keys(drivers).length === 0) {
      alert('Add at least one driver first.');
      return;
    }
    const roster = {};
    let missingPhone = false;
    Object.keys(drivers).forEach((name) => {
      const phone = driverPhones[name];
      if (!phone || !normalisePhone(phone)) { missingPhone = true; return; }
      roster[hashPhone(phone)] = name;
    });
    if (missingPhone) {
      if (!window.confirm('Some drivers have no phone number and will not be able to vote. Continue anyway?')) return;
    }
    const pollId = `${selectedDate}-${Date.now().toString(36)}`;
    const cutoffInstant = computeCutoff(selectedDate);
    set(ref(db, `polls/${pollId}`), {
      date: selectedDate,
      createdAt: new Date().toISOString(),
      cutoffISO: cutoffInstant ? cutoffInstant.toISOString() : null,
      cutoffLabel: formatCutoff(selectedDate),
      roster,
      votes: {}
    }).then(() => {
      setActivePollId(pollId);
      // A brand-new poll starts with a clean slate — clear any ticks carried over from the
      // previous poll so nobody shows as "available" until they actually vote in this poll.
      setAvailableDrivers({});
      setPollVotes({});
      // Also clear and UNLOCK the previous week's allocation, so it doesn't linger as an
      // approved/locked plan against the new poll. The new allocation is built fresh once
      // votes are in.
      setAllocations({});
      setProposedAllocation({});
      setAllocationApproved(false);
      setAutoAllocated(false);
    }).catch((err) => {
      alert('Could not open poll: ' + err.message);
    });
  };

  // ============================================================================
  // BACKUP / EXPORT
  // ============================================================================

  const exportData = () => {
    const dataToExport = {
      addresses, drivers, driverPhones, driverPreferences,
      anchorDate, anchorWeek, anchorFirstOfMonth,
      pollMessage, deliveryMessage, butcherEmailTemplate,
      butcherEmailAddress: butcherEmailAddress || null,
      collectionAddress: collectionAddress || null,
      collectionLat: collectionLat,
      collectionLng: collectionLng,
      cutoffDay, cutoffHour, cutoffMinute, forceUKTime,
      broughtForwardTotal, deliveryHistory,
      exportedAt: new Date().toISOString()
    };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `charity-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ============================================================================
  // PER-WEEK OVERRIDES
  // ============================================================================

  const setOverrideField = (key, field, value) => {
    setWeekOverrides(prev => {
      const forDate = { ...(prev[selectedDate] || {}) };
      const existing = { ...(forDate[key] || {}) };
      if (value === '' || value == null) {
        delete existing[field];
      } else {
        existing[field] = value;
      }
      forDate[key] = existing;
      return { ...prev, [selectedDate]: forDate };
    });
  };

  const toggleExcludeAddress = (key) => {
    setWeekOverrides(prev => {
      const forDate = { ...(prev[selectedDate] || {}) };
      const existing = { ...(forDate[key] || {}) };
      existing.excluded = !existing.excluded;
      forDate[key] = existing;
      return { ...prev, [selectedDate]: forDate };
    });
  };

  const clearOverride = (key) => {
    setWeekOverrides(prev => {
      const forDate = { ...(prev[selectedDate] || {}) };
      delete forDate[key];
      return { ...prev, [selectedDate]: forDate };
    });
  };

  // ============================================================================
  // POLL RESULTS (live) + AVAILABILITY
  // ============================================================================

  // Listen to votes for the active poll
  const lastPolledIdRef = useRef(null);
  useEffect(() => {
    if (!db || !activePollId) return;
    const votesRef = ref(db, `polls/${activePollId}/votes`);
    const unsub = onValue(votesRef, (snap) => {
      const v = snap.val() || {};
      setPollVotes(v);
      // When we switch to a different poll, wipe availability first so ticks from the
      // previous poll don't linger. Within the same poll, preserve existing state (so
      // manual admin toggles and already-applied votes are kept).
      const pollChanged = lastPolledIdRef.current !== activePollId;
      lastPolledIdRef.current = activePollId;
      // Auto-apply votes to availability. Match each driver to their vote by phone-hash
      // (stable) then name, and only apply votes that have a real available value.
      setAvailableDrivers((prev) => {
        const next = pollChanged ? {} : { ...prev };
        Object.keys(drivers).forEach((name) => {
          const phone = driverPhones[name];
          let vote = null;
          if (phone && normalisePhone(phone) && v[hashPhone(phone)]) {
            vote = v[hashPhone(phone)];
          } else {
            Object.values(v).forEach((x) => { if (x && x.name === name) vote = x; });
          }
          if (vote && typeof vote.available === 'boolean') {
            next[name] = vote.available;
          }
        });
        return next;
      });
    });
    return () => unsub();
  }, [activePollId, drivers, driverPhones]);

  // Find a driver's vote robustly: match by phone-hash (stable across renames) first,
  // then fall back to matching by name (for older votes or admin entries).
  const getDriverVote = (name) => {
    const phone = driverPhones[name];
    let byHash = null;
    if (phone && normalisePhone(phone)) {
      const h = hashPhone(phone);
      if (pollVotes[h]) byHash = pollVotes[h];
    }
    let byName = null;
    Object.values(pollVotes).forEach((vote) => { if (vote && vote.name === name) byName = vote; });
    // Prefer a vote that has a real available value; ignore malformed entries.
    const candidates = [byHash, byName].filter(v => v && typeof v.available === 'boolean');
    if (candidates.length === 0) return null;
    // If both exist, prefer the most recent.
    candidates.sort((a, b) => (new Date(b.at || 0)) - (new Date(a.at || 0)));
    return candidates[0];
  };

  // Seed availability from votes (available === true). Manual overrides preserved.
  const seedAvailabilityFromVotes = () => {
    const seed = {};
    Object.keys(drivers).forEach((name) => { seed[name] = false; });
    Object.keys(drivers).forEach((name) => {
      const dv = getDriverVote(name);
      if (dv && dv.available) seed[name] = true;
    });
    setAvailableDrivers(seed);
  };

  const toggleDriverAvailable = (name) => {
    const newValue = !availableDrivers[name];
    // If the driver already has their own real vote, confirm before overriding it.
    const existing = getDriverVote(name);
    if (existing && existing.by !== 'admin' && typeof existing.available === 'boolean' && existing.available !== newValue) {
      if (!window.confirm(`${name} voted "${existing.available ? 'available' : 'not available'}" themselves. Override their own vote?`)) {
        return;
      }
    }
    // Update local state immediately for responsiveness.
    setAvailableDrivers(prev => ({ ...prev, [name]: newValue }));
    // If a poll is live, record this as a vote in the poll itself, tagged as admin-set.
    // Keyed by the driver's phone hash (same key a real vote uses), so the driver's own
    // later vote overwrites it. If no phone, fall back to a name-based key.
    if (activePollId && db) {
      const phone = driverPhones[name];
      const key = (phone && normalisePhone(phone)) ? hashPhone(phone) : ('admin_' + name.replace(/[^a-zA-Z0-9]/g, '_'));
      set(ref(db, `polls/${activePollId}/votes/${key}`), {
        name,
        available: newValue,
        at: new Date().toISOString(),
        by: 'admin'
      }).catch((err) => console.error('Could not record manual availability:', err));
    }
  };

  // ============================================================================
  // ALLOCATION ALGORITHM
  // ============================================================================

  const runAutoAllocation = () => {
    const avail = Object.keys(drivers).filter(d => availableDrivers[d]);
    if (avail.length === 0) {
      alert('No drivers marked available. Tick at least one driver, or load the poll results.');
      return;
    }
    const keys = Object.keys(calculatedAddresses);
    
    
    
    const result = {};
    avail.forEach(d => { result[d] = []; });
    const unassigned = [];

    const addrInfo=(key)=>addresses[key]||{};
    const eligibleFor = (key) => {
      const avoid = (addrInfo(key).avoidDrivers) || [];
      return avail.filter(d => !avoid.includes(d));
    };
    const dist = (a, b) => { const dlat = a.lat - b.lat, dlng = a.lng - b.lng; return Math.sqrt(dlat*dlat + dlng*dlng); };
    const centroid = (d) => {
      const pts = result[d].map(k => addrInfo(k)).filter(a => typeof a.lat === 'number');
      if (!pts.length) return null;
      return { lat: pts.reduce((s,a)=>s+a.lat,0)/pts.length, lng: pts.reduce((s,a)=>s+a.lng,0)/pts.length };
    };

    // Step 1: preferred drivers
    let pool = [];
    keys.forEach(key => {
      const a = addrInfo(key);
      const elig = eligibleFor(key);
      if (a.preferredDriver && elig.includes(a.preferredDriver)) result[a.preferredDriver].push(key);
      else pool.push(key);
    });

    const withCoords = pool.filter(k => typeof addrInfo(k).lat === 'number');
    const noCoords = pool.filter(k => typeof addrInfo(k).lat !== 'number');
    const target = Math.ceil(keys.length / avail.length);

    // Step 2: seed geographically separated starting points (one per driver)
    const seeds = [];
    if (withCoords.length > 0) {
      const gc = {
        lat: withCoords.reduce((s,k)=>s+addrInfo(k).lat,0)/withCoords.length,
        lng: withCoords.reduce((s,k)=>s+addrInfo(k).lng,0)/withCoords.length
      };
      let first = withCoords.reduce((best,k)=> dist(addrInfo(k),gc) > dist(addrInfo(best),gc) ? k : best, withCoords[0]);
      seeds.push(first);
      while (seeds.length < avail.length && seeds.length < withCoords.length) {
        let next = null, bestMinDist = -1;
        withCoords.forEach(k => {
          if (seeds.includes(k)) return;
          const md = Math.min(...seeds.map(s => dist(addrInfo(k), addrInfo(s))));
          if (md > bestMinDist) { bestMinDist = md; next = k; }
        });
        if (next) seeds.push(next); else break;
      }
    }

    // assign seeds to eligible drivers (distinct where possible)
    const usedDrivers = new Set();
    seeds.forEach(seedKey => {
      const elig = eligibleFor(seedKey).filter(d => !usedDrivers.has(d));
      const d = elig[0] || eligibleFor(seedKey)[0];
      if (d) { result[d].push(seedKey); usedDrivers.add(d); }
      else unassigned.push(seedKey);
    });

    // Step 3: grow clusters - assign remaining to nearest eligible driver under target
    const remaining = withCoords.filter(k => !seeds.includes(k));
    remaining.sort((k1,k2) => {
      const d1 = Math.min(...avail.map(d => { const c = centroid(d); return c ? dist(addrInfo(k1),c) : 1e9; }));
      const d2 = Math.min(...avail.map(d => { const c = centroid(d); return c ? dist(addrInfo(k2),c) : 1e9; }));
      return d1 - d2;
    });
    remaining.forEach(key => {
      const a = addrInfo(key);
      const elig = eligibleFor(key);
      if (elig.length === 0) { unassigned.push(key); return; }
      const under = elig.filter(d => result[d].length < target);
      const pick = (under.length ? under : elig);
      pick.sort((d1,d2) => {
        const c1 = centroid(d1), c2 = centroid(d2);
        const dd1 = c1 ? dist(a,c1) : 1e9, dd2 = c2 ? dist(a,c2) : 1e9;
        if (dd1 !== dd2) return dd1 - dd2;
        return result[d1].length - result[d2].length;
      });
      result[pick[0]].push(key);
    });

    // Step 4: addresses without coordinates - pure balance
    noCoords.forEach(key => {
      const elig = eligibleFor(key);
      if (elig.length === 0) { unassigned.push(key); return; }
      const minCount = Math.min(...elig.map(d => result[d].length));
      result[elig.find(d => result[d].length === minCount)].push(key);
    });

    // FINAL REBALANCE: even out counts to spread <= 1.
    // Preferred addresses are honoured as far as balance allows: they stay put unless
    // their driver is over the fair share, in which case a preferred address can be
    // moved to balance counts. Avoid constraints are always respected.
    const dist2 = (a,b) => { const dl=a.lat-b.lat, dn=a.lng-b.lng; return Math.sqrt(dl*dl+dn*dn); };
    const cent = (d) => {
      const pts = result[d].map(k=>addrInfo(k)).filter(a=>typeof a.lat==='number');
      if(!pts.length) return null;
      return {lat:pts.reduce((s,a)=>s+a.lat,0)/pts.length, lng:pts.reduce((s,a)=>s+a.lng,0)/pts.length};
    };
    let rbGuard = 0;
    while (rbGuard++ < 500) {
      let maxD = avail[0], minD = avail[0];
      avail.forEach(d => { if(result[d].length>result[maxD].length)maxD=d; if(result[d].length<result[minD].length)minD=d; });
      if (result[maxD].length - result[minD].length <= 1) break;
      const minC = cent(minD);
      const maxC = cent(maxD);
      // Is an address "preferred-locked" to maxD? It's protected UNLESS maxD is over the
      // fair-share target — then preferred addresses become movable so counts can balance.
      const maxOverTarget = result[maxD].length > target;
      const protectedForMax = (key) => {
        const a = addrInfo(key);
        if (a.preferredDriver === maxD && avail.includes(maxD)) {
          return !maxOverTarget; // protected only while maxD isn't over target
        }
        return false;
      };
      // Choose the address to move by GAIN, but prefer moving NON-preferred addresses:
      // we add a big bonus to non-preferred so a preferred one only moves if nothing else fits.
      let bestKey=null, bestScore=-Infinity;
      result[maxD].forEach(key => {
        if (protectedForMax(key)) return;
        if (((addrInfo(key).avoidDrivers)||[]).includes(minD)) return;
        const a = addrInfo(key);
        const isPref = a.preferredDriver === maxD;
        let gain;
        if (typeof a.lat !== 'number') {
          gain = 0;
        } else {
          const distToCurrent = maxC ? dist2(a, maxC) : 0;
          const distToNew = minC ? dist2(a, minC) : 0;
          gain = distToCurrent - distToNew;
        }
        // Strongly prefer moving non-preferred addresses (bonus dwarfs geographic gain).
        const score = gain + (isPref ? 0 : 100);
        if (score > bestScore) { bestScore = score; bestKey = key; }
      });
      if (!bestKey) {
        let moved = false;
        const overs = avail.slice().sort((a,b)=>result[b].length-result[a].length);
        for (const od of overs) {
          if (result[od].length - result[minD].length <= 1) break;
          const odOver = result[od].length > target;
          const cand = result[od].find(key => {
            const a = addrInfo(key);
            if (((a.avoidDrivers)||[]).includes(minD)) return false;
            if (a.preferredDriver === od && avail.includes(od) && !odOver) return false;
            return true;
          });
          if (cand) { result[od]=result[od].filter(x=>x!==cand); result[minD].push(cand); moved=true; break; }
        }
        if (!moved) break;
        continue;
      }
      result[maxD] = result[maxD].filter(x=>x!==bestKey);
      result[minD].push(bestKey);
    }

    // COMPACTNESS PASS: swap pairs of addresses between drivers when it reduces total
    // distance-to-centroid, without changing counts. This tightens scattered rounds
    // (e.g. an address that landed far from its driver) while keeping balance intact.
    const distToCentroid = (key, driver) => {
      const c = cent(driver);
      const a = addrInfo(key);
      if (!c || typeof a.lat !== 'number') return 0;
      return dist2(a, c);
    };
    const canHave = (key, driver) => {
      const a = addrInfo(key);
      if (((a.avoidDrivers)||[]).includes(driver)) return false;
      // don't move a preferred address away from its (available) preferred driver via swap
      if (a.preferredDriver && a.preferredDriver !== driver && avail.includes(a.preferredDriver) && a.preferredDriver === driver) return false;
      return true;
    };
    let swapGuard = 0;
    while (swapGuard++ < 300) {
      let bestImprove = 0.0000001, bestSwap = null;
      for (let i = 0; i < avail.length; i++) {
        for (let j = i + 1; j < avail.length; j++) {
          const d1 = avail[i], d2 = avail[j];
          result[d1].forEach((k1) => {
            const a1 = addrInfo(k1);
            if (a1.preferredDriver === d1 && avail.includes(d1)) return; // keep preferred where it belongs
            if (((a1.avoidDrivers)||[]).includes(d2)) return;
            result[d2].forEach((k2) => {
              const a2 = addrInfo(k2);
              if (a2.preferredDriver === d2 && avail.includes(d2)) return;
              if (((a2.avoidDrivers)||[]).includes(d1)) return;
              if (typeof a1.lat !== 'number' || typeof a2.lat !== 'number') return;
              // current cost vs swapped cost (using current centroids as approximation)
              const before = distToCentroid(k1, d1) + distToCentroid(k2, d2);
              const after = distToCentroid(k1, d2) + distToCentroid(k2, d1);
              const improve = before - after;
              if (improve > bestImprove) { bestImprove = improve; bestSwap = { d1, d2, k1, k2 }; }
            });
          });
        }
      }
      if (!bestSwap) break;
      const { d1, d2, k1, k2 } = bestSwap;
      result[d1] = result[d1].filter(x => x !== k1); result[d1].push(k2);
      result[d2] = result[d2].filter(x => x !== k2); result[d2].push(k1);
    }

    if (unassigned.length > 0) result.__unassigned = unassigned;
    setProposedAllocation(result);
    setAllocationApproved(false);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    
  };



  // Move an address to a different driver (manual override in review)
  const reassignAddress = (key, toDriver) => {
    setProposedAllocation(prev => {
      const next = {};
      Object.keys(prev).forEach(d => { next[d] = prev[d].filter(k => k !== key); });
      if (!next[toDriver]) next[toDriver] = [];
      if (toDriver === '__unassigned') {
        next.__unassigned = next.__unassigned || [];
        next.__unassigned.push(key);
      } else {
        next[toDriver].push(key);
      }
      return next;
    });
  };

  // Invite a new admin: create their account (so it exists) then send them a reset email
  // so THEY set their own password. We use a SECONDARY Firebase app instance so creating
  // the account doesn't sign the current admin out of their own session.
  const inviteAdmin = async () => {
    const email = (newUserEmail || '').trim();
    if (!email) { setUserMgmtMsg('Enter an email address.'); return; }
    setUserMgmtBusy(true);
    setUserMgmtMsg('');
    let secondaryApp = null;
    try {
      // random temporary password — the user never needs it; they set their own via email
      const tempPwd = 'Tmp-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!9';
      secondaryApp = initializeApp(firebaseConfig, 'invite-' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      await createUserWithEmailAndPassword(secondaryAuth, email, tempPwd);
      await signOut(secondaryAuth); // sign out the secondary session immediately
      // send the new admin a link to set their own password
      await sendPasswordResetEmail(auth, email);
      // record in the shared admin-user list for display
      try {
        const exists = adminUsers.some((u) => u.email.toLowerCase() === email.toLowerCase());
        const next = exists ? adminUsers : [...adminUsers, { email, lastSeen: null, invitedAt: new Date().toISOString() }];
        await set(ref(db, 'adminUsers'), next);
      } catch (e) { /* display list is best-effort */ }
      setUserMgmtMsg('✓ Invited ' + email + '. They have been emailed a link to set their password.');
      setNewUserEmail('');
    } catch (e) {
      if (e && e.code === 'auth/email-already-in-use') {
        // account already exists — just (re)send them a set-password link
        try {
          await sendPasswordResetEmail(auth, email);
          setUserMgmtMsg('That email already has an account — a fresh set-password link has been sent to them.');
          setNewUserEmail('');
        } catch (e2) {
          setUserMgmtMsg('Could not send the email: ' + e2.message);
        }
      } else {
        setUserMgmtMsg('Could not invite: ' + (e && e.message ? e.message : 'unknown error'));
      }
    } finally {
      if (secondaryApp) { try { await deleteApp(secondaryApp); } catch (e) {} }
      setUserMgmtBusy(false);
    }
  };

  const removeAdminFromList = async (email) => {
    if (email === 'avner@radomsky.co.uk') { setUserMgmtMsg('The main admin cannot be removed from the list.'); return; }
    if (!window.confirm('Remove ' + email + ' from this list?\n\nNote: this only removes them from this display list. To fully revoke their login, also delete their account in the Firebase Console (Authentication → Users).')) return;
    try {
      const next = adminUsers.filter((u) => u.email !== email);
      await set(ref(db, 'adminUsers'), next);
      setUserMgmtMsg('Removed ' + email + ' from the list. Remember to also delete their account in the Firebase Console to fully revoke access.');
    } catch (e) {
      setUserMgmtMsg('Could not update the list: ' + e.message);
    }
  };

  const approveAllocation = () => {
    const hasUnassigned = proposedAllocation.__unassigned && proposedAllocation.__unassigned.length > 0;
    if (hasUnassigned) {
      if (!window.confirm('Some addresses are unassigned. Approve anyway?')) return;
    }
    setAllocations(proposedAllocation);
    setAllocationApproved(true);

    // Record this round into delivery history, keyed by delivery date (overwrite on re-approve).
    const perDriver = {};
    let totC = 0, totM = 0, totP = 0, totDeliveries = 0;
    Object.keys(proposedAllocation).forEach((driver) => {
      if (driver === '__unassigned') return;
      const keys = proposedAllocation[driver] || [];
      let dCount = 0, c = 0, m = 0, p = 0;
      keys.forEach((key) => {
        const address = addresses[key];
        dCount += addressDeliveryCount(address, selectedDate, deliveryType);
        const q = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
        c += q.chicken; m += q.meat; p += q.pies;
      });
      perDriver[driver] = { deliveries: dCount, chicken: c, meat: m, pies: p, stops: keys.length };
      totDeliveries += dCount; totC += c; totM += m; totP += p;
    });
    setDeliveryHistory((prev) => ({
      ...prev,
      [selectedDate]: {
        date: selectedDate,
        deliveryType,
        approvedAt: new Date().toISOString(),
        perDriver,
        totals: { deliveries: totDeliveries, chicken: totC, meat: totM, pies: totP }
      }
    }));

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const unlockAllocation = () => {
    setAllocationApproved(false);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  // ============================================================================
  // PER-DRIVER SEND (image via Web Share, route link)
  // ============================================================================

  // Order a list of address keys by a nearest-neighbour path (start at first stop,
  // always go to the closest unvisited next). Un-geocoded stops go at the end.
  // This is the single source of truth for driving order, used in the review, the
  // driver image, and the Google Maps route link so they all match.
  // Approximate straight-line distance in miles between two addresses (for spotting outliers).
  const milesBetween = (k1, k2) => {
    const a = addresses[k1], b = addresses[k2];
    if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return null;
    const R = 3958.8; // earth radius in miles
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return R * 2 * Math.asin(Math.sqrt(h));
  };

  const singleMapLink = (key) => {
    // Use the same resolution rules as the route (full address, strip "Flat N" to building
    // name, coordinates only for pure house-names) so the pin lands in the same place.
    return 'https://www.google.com/maps/search/?api=1&query=' + addressWaypoint(key);
  };

  const orderStops = (keys) => {
    const withCoords = keys.filter((k) => {
      const a = addresses[k] || {};
      return typeof a.lat === 'number' && typeof a.lng === 'number';
    });
    const noCoords = keys.filter((k) => {
      const a = addresses[k] || {};
      return !(typeof a.lat === 'number' && typeof a.lng === 'number');
    });
    const dist = (a, b) => {
      const dlat = a.lat - b.lat, dlng = a.lng - b.lng;
      return Math.sqrt(dlat * dlat + dlng * dlng);
    };
    let ordered = [];
    if (withCoords.length > 0) {
      const remaining = withCoords.slice();
      // Start from the address nearest the collection point (if set), so the driver
      // heads to their closest delivery first after collecting. Otherwise start at the first.
      let startIdx = 0;
      if (typeof collectionLat === 'number' && typeof collectionLng === 'number') {
        const cp = { lat: collectionLat, lng: collectionLng };
        let bestDist = Infinity;
        remaining.forEach((k, idx) => {
          const d = dist(cp, addresses[k]);
          if (d < bestDist) { bestDist = d; startIdx = idx; }
        });
      }
      let current = remaining.splice(startIdx, 1)[0];
      ordered.push(current);
      while (remaining.length > 0) {
        const cur = addresses[current];
        let bestIdx = 0, bestDist = Infinity;
        remaining.forEach((k, idx) => {
          const d = dist(cur, addresses[k]);
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });
        current = remaining.splice(bestIdx, 1)[0];
        ordered.push(current);
      }
    }
    // Same-street ordering: group stops that share a postcode (robust against small
    // address-text differences like "Herts" being present or not), sort each group by
    // house number ascending, and keep the groups in their nearest-neighbour order. This
    // also pulls together same-street stops that the path left non-adjacent.
    const houseNum = (k) => {
      const a = addresses[k] || {};
      // first standalone number that isn't a flat number — handle "Flat 2, 1 Beech Drive"
      const full = (a.fullAddress || k);
      const stripped = full.replace(/^\s*flat\s*\d+,?\s*/i, '');
      const m = stripped.match(/\d+/);
      return m ? parseInt(m[0], 10) : Infinity;
    };
    const groupKeyOf = (k) => {
      const a = addresses[k] || {};
      let full = (a.fullAddress || k);
      // strip leading flat + house number
      full = full.replace(/^\s*(flat\s*\d+,?\s*)?\d+[a-z]?\s*,?\s*/i, '');
      // take just the street name (first comma-separated part), normalised
      let street = full.split(',')[0].toLowerCase().trim();
      // drop common county/town noise and punctuation
      street = street.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      return street || ('pc:' + (a.postcode || '').replace(/\s+/g, '').toLowerCase());
    };
    const result = [];
    const done = new Set();
    ordered.forEach((k) => {
      if (done.has(k)) return;
      const gk = groupKeyOf(k);
      // collect every not-yet-placed stop in this group, in nearest-neighbour order
      const group = ordered.filter((x) => !done.has(x) && groupKeyOf(x) === gk);
      group.sort((a, b) => houseNum(a) - houseNum(b));
      group.forEach((x) => { result.push(x); done.add(x); });
    });
    return result.concat(noCoords);
  };

  // Resolve a single address to the best Google-Maps query string, using the same rules
  // for both the route and the per-address Map links:
  //  - strip a leading "Flat N" so Google searches on the building name / street
  //  - a pure house NAME with no number anywhere → use coordinates (text search is unreliable)
  //  - otherwise → full address text + postcode (resolves the actual door)
  // Returns an already-encoded segment (coords are sent raw, as Google expects).
  const addressWaypoint = (key) => {
    const a = addresses[key] || {};
    const fullRaw = (a.fullAddress || key);
    const full = fullRaw.replace(/^\s*flat\s*\d+[a-z]?\s*,?\s*/i, '');
    const originalHasNumber = /\d/.test(fullRaw);
    if (!originalHasNumber && typeof a.lat === 'number' && typeof a.lng === 'number') {
      return a.lat + ',' + a.lng;
    }
    const text = full.replace(/,\s*$/, '') + (a.postcode ? ', ' + a.postcode : '');
    return encodeURIComponent(text.trim());
  };

  const buildRouteLink = (keys) => {
    const ordered = orderStops(keys);
    const seen = new Set();
    const parts = [];
    ordered.forEach((key) => {
      const a = addresses[key] || {};
      const fullRaw = (a.fullAddress || key);
      const full = fullRaw.replace(/^\s*flat\s*\d+[a-z]?\s*,?\s*/i, '');
      const waypoint = addressWaypoint(key);
      // Collapse stops that are truly the SAME doorstep (e.g. two families at the same
      // building, like two "204 Colleridge Way" flats). The mobile Google Maps app breaks
      // when given two stops at the same point. We only merge when BOTH the house/flat
      // number AND the coordinates match — so different houses on a street that happen to
      // share a geocoded point (e.g. 158 vs 204) are NOT merged. Both families still appear
      // in the driver's delivery list; this only affects the map route.
      const houseNum = (full.match(/\d+[a-z]?/i) || [''])[0].toLowerCase();
      const coordPart = (typeof a.lat === 'number' && typeof a.lng === 'number')
        ? a.lat.toFixed(5) + ',' + a.lng.toFixed(5) : '';
      const dedupKey = (houseNum || coordPart) ? (houseNum + '@' + coordPart) : waypoint;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      parts.push(waypoint);
    });
    if (parts.length === 0) return '';
    // Empty first segment = "my current location", so Google routes the driver from
    // wherever they are, through the stops in order.
    return 'https://www.google.com/maps/dir/' + '/' + parts.join('/');
  };

  const buildDriverCaption = (driverName, keys) => {
    const header = deliveryMessage
      .replace(/\{DRIVER\}/g, driverName)
      .replace(/\{DATE\}/g, formatUKDate(selectedDate))
      .replace(/\{STOPS\}/g, keys.length);
    const route = buildRouteLink(keys);
    return header + (route ? `\n\n🗺️ Route: ${route}` : '');
  };

  // Build well-formed XHTML for the driver's delivery table (for rasterising to PNG)
  const buildDriverXHTML = (driverName, keys) => {
    const width = 600;
    const rowsHTML = keys.map((key) => {
      const a = addresses[key] || {};
      const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
      const notes = a.notes ? `<div style="font-size:11px;color:#c62828;margin-top:2px;">${escapeXML(a.notes)}</div>` : '';
      return `<tr style="border-bottom:1px solid #dddddd;">
        <td style="padding:8px;border-right:1px solid #dddddd;vertical-align:top;"><strong>${escapeXML(a.fullAddress || key)}</strong>${notes}</td>
        <td style="padding:8px;text-align:center;border-right:1px solid #dddddd;font-weight:bold;">${c.chicken}</td>
        <td style="padding:8px;text-align:center;border-right:1px solid #dddddd;font-weight:bold;">${c.meat}</td>
        <td style="padding:8px;text-align:center;font-weight:bold;">${c.pies}</td>
      </tr>`;
    }).join('');
    return `<div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;background:#ffffff;padding:16px;width:${width - 32}px;color:#222222;">
      <div style="font-size:18px;font-weight:bold;margin-bottom:4px;">DELIVERY LIST — ${escapeXML(driverName)}</div>
      <div style="font-size:13px;color:#666666;margin-bottom:2px;">Week of: ${formatUKDate(selectedDate)}</div>
      <div style="font-size:13px;color:#666666;margin-bottom:10px;">Total stops: ${keys.length}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f0f0f0;">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #333333;">Address</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #333333;">Chk</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #333333;">Mt</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #333333;">Pie</th>
        </tr>
        ${rowsHTML}
      </table>
    </div>`;
  };

  const escapeXML = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  // Rasterise the XHTML into a PNG blob via SVG foreignObject + canvas
  // Draw the delivery list directly onto a canvas (reliable on all phones - no foreignObject).
  const rasteriseToPng = (driverName, rawKeys) => new Promise((resolve, reject) => {
    try {
      const keys = orderStops(rawKeys); // driving order
      const scale = 2; // retina-quality
      const width = 620;
      const headerH = 96;
      const footerH = 20;

      // Group stops by their exact order combination (e.g. "1 Chicken, 1 Meat") so the
      // driver can pack parcels in batches. Build a sorted list of "combo -> stop count".
      const comboCounts = {};
      rawKeys.forEach((key) => {
        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
        if ((c.chicken + c.meat + c.pies) === 0) return;
        const partsArr = [];
        if (c.chicken) partsArr.push(c.chicken + ' Chicken');
        if (c.meat) partsArr.push(c.meat + ' Meat');
        if (c.pies) partsArr.push(c.pies + ' Pies');
        const label = partsArr.join(', ');
        comboCounts[label] = (comboCounts[label] || 0) + 1;
      });
      // Sort: most common combination first, then alphabetically for stable ties.
      const comboList = Object.keys(comboCounts)
        .map((label) => ({ label, count: comboCounts[label] }))
        .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
      const comboLineH = 19;
      // totals box = header line + qty line + a "packing groups" heading + the combo lines
      const totalsH = 70 + 24 + (comboList.length * comboLineH) + 10;

      // We need ctx early to measure text for wrapping, so create canvas first.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Word-wrap a string to fit maxW, returning an array of lines.
      const wrapText = (text, maxW) => {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let line = '';
        words.forEach((w) => {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width <= maxW || !line) {
            line = test;
          } else {
            lines.push(line); line = w;
          }
        });
        if (line) lines.push(line);
        return lines;
      };

      // Pre-compute each row's note lines + height. Base row holds address (y) and
      // quantities (y+28). Notes start at y+52, each extra wrapped line adds ~20px.
      const noteFont = 'bold italic 16px Arial, sans-serif';
      const baseRowH = 62;       // address + quantities, no note
      const noteLineH = 20;
      const addrFont = 'bold 19px Arial, sans-serif';
      const addrLineH = 24;
      const rowInfo = keys.map((key) => {
        const a = addresses[key] || {};
        // wrap the address (incl postcode) onto as many lines as needed
        ctx.font = addrFont;
        const addrText = (a.fullAddress || key) + (a.postcode ? '  ' + a.postcode : '');
        const addrLines = wrapText(addrText, width - 32);
        let noteLines = [];
        if (a.notes) {
          ctx.font = noteFont;
          noteLines = wrapText('Note: ' + a.notes, width - 32);
        }
        // base = first address line + quantities; extra address lines and notes add height
        const extraAddr = (addrLines.length - 1) * addrLineH;
        const h = baseRowH + extraAddr + (noteLines.length > 0 ? (10 + noteLines.length * noteLineH) : 0) + 12;
        return { key, addrLines, noteLines, h };
      });
      const bodyH = rowInfo.reduce((s, r) => s + r.h, 0);
      const height = headerH + bodyH + totalsH + footerH;

      // compute totals for collection
      let totC = 0, totM = 0, totP = 0;
      keys.forEach((key) => {
        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
        totC += c.chicken; totM += c.meat; totP += c.pies;
      });
      const showPies = totP > 0; // only show the Pies column if any are ordered this round

      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // header
      ctx.fillStyle = '#222222';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('DELIVERY LIST', 16, 14);
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillStyle = '#444444';
      ctx.fillText(driverName, 16, 40);
      ctx.font = '13px Arial, sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('Week of ' + formatUKDate(selectedDate) + '  •  ' + keys.length + ' stops', 16, 64);

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, headerH - 6);
      ctx.lineTo(width - 16, headerH - 6);
      ctx.stroke();

      const fit = (text, maxW) => {
        text = String(text || '');
        if (ctx.measureText(text).width <= maxW) return text;
        while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        return text + '…';
      };

      let y = headerH + 10;
      rowInfo.forEach((info, idx) => {
        const key = info.key;
        const a = addresses[key] || {};
        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
        const rH = info.h;

        if (idx % 2 === 1) {
          ctx.fillStyle = '#e3edf7';
          ctx.fillRect(8, y - 6, width - 16, rH);
        }

        // address + postcode (bold), wrapped onto as many lines as needed
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 19px Arial, sans-serif';
        let ay = y;
        info.addrLines.forEach((ln) => { ctx.fillText(ln, 16, ay); ay += 24; });

        // quantities, full words — positioned just below the (possibly multi-line) address
        ctx.font = 'bold 17px Arial, sans-serif';
        ctx.fillStyle = '#222222';
        const qty = 'Chicken: ' + c.chicken + '    Meat: ' + c.meat + (showPies ? '    Pies: ' + c.pies : '');
        const qtyY = y + (info.addrLines.length - 1) * 24 + 28;
        ctx.fillText(qty, 16, qtyY);

        // notes (wrapped onto as many lines as needed), below the quantities
        if (info.noteLines.length > 0) {
          ctx.font = 'bold italic 16px Arial, sans-serif';
          ctx.fillStyle = '#c0392b';
          let ny = qtyY + 24;
          info.noteLines.forEach((ln) => { ctx.fillText(ln, 16, ny); ny += 20; });
        }

        ctx.strokeStyle = '#e2e2e2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, y + rH - 8);
        ctx.lineTo(width - 16, y + rH - 8);
        ctx.stroke();

        y += rH;
      });

      // TOTALS box (for collection)
      y += 4;
      ctx.fillStyle = '#eef6ee';
      ctx.fillRect(8, y, width - 16, totalsH - 12);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, y, width - 16, totalsH - 12);
      ctx.fillStyle = '#1b5e20';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText('TOTAL TO COLLECT    (Stops: ' + keys.length + ')', 20, y + 10);
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillStyle = '#111111';
      ctx.fillText('Chicken: ' + totC + '      Meat: ' + totM + (showPies ? '      Pies: ' + totP : ''), 20, y + 32);

      // Packing groups: how many stops share each order combination, for easy batching.
      let gy = y + 58;
      ctx.fillStyle = '#1b5e20';
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.fillText('PACKING GROUPS', 20, gy);
      gy += 18;
      ctx.font = '14px Arial, sans-serif';
      ctx.fillStyle = '#222222';
      comboList.forEach((g) => {
        ctx.fillText('• ' + g.label + '  =  ' + g.count + (g.count === 1 ? ' stop' : ' stops'), 24, gy);
        gy += comboLineH;
      });

      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error('Could not create image'));
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });

  // Build ONE image containing every driver's card stacked, with an overall totals header.
  // Build ONE image with drivers laid out as cards in TWO columns. The two-column layout
  // roughly halves the height vs a single stack, so far more detail survives WhatsApp's
  // ~4000px downscale limit and the shared image stays sharp.
  const rasteriseAllToPng = () => new Promise((resolve, reject) => {
    try {
      const NUM_COLS = 3;         // 3 columns makes the image roughly square, which fits
      const colW = 560;           // WhatsApp's ~1600px photo limit with the least downscaling
      const colGap = 20;          // gap between columns
      const width = NUM_COLS * colW + (NUM_COLS - 1) * colGap + 32;
      const rowH = 64;
      const driverHeaderH = 56;
      const driverTotalsH = 56;
      const driverGap = 30;
      const grandHeaderH = 110;

      const driverNames = Object.keys(allocations).filter((d) => d !== '__unassigned' && allocations[d] && allocations[d].length > 0);

      // grand + per-driver totals
      let gStops = 0, gC = 0, gM = 0, gP = 0;
      const perDriver = {};
      driverNames.forEach((d) => {
        let s = 0, c = 0, m = 0, p = 0;
        (allocations[d] || []).forEach((key) => {
          const q = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
          s += 1; c += q.chicken; m += q.meat; p += q.pies;
        });
        perDriver[d] = { stops: s, chicken: c, meat: m, pies: p };
        gStops += s; gC += c; gM += m; gP += p;
      });
      const showPies = gP > 0;

      const tableRowH = 26;
      const tableH = 30 + (driverNames.length + 1) * tableRowH + 16;
      const grandHeaderTotalH = grandHeaderH + tableH;

      // Height of one driver's card
      const cardHeight = (d) => driverHeaderH + (allocations[d].length * rowH) + driverTotalsH + driverGap;

      // Distribute drivers across two columns balancing total height (greedy: tallest first
      // to the shorter column). Keeps the two columns roughly equal so the image isn't lopsided.
      const colHeights = new Array(NUM_COLS).fill(0);
      const colDrivers = Array.from({ length: NUM_COLS }, () => []);
      driverNames.slice().sort((a, b) => cardHeight(b) - cardHeight(a)).forEach((d) => {
        // place each driver in the currently-shortest column
        let target = 0;
        for (let c = 1; c < NUM_COLS; c++) { if (colHeights[c] < colHeights[target]) target = c; }
        colDrivers[target].push(d);
        colHeights[target] += cardHeight(d);
      });
      const bodyH = Math.max(...colHeights);
      const totalH = grandHeaderTotalH + bodyH + 20;

      // WhatsApp recompresses shared photos: it downscales so the LONGEST side is ~1600px
      // and re-encodes as JPEG. Rendering huge therefore backfires — WhatsApp shrinks it
      // hard and text blurs. Instead we render so the longest side lands near WhatsApp's
      // kept size, so there's little/no downscaling and the (large) text stays crisp.
      const TARGET_LONG = 1600;
      const longSide = Math.max(width, totalH);
      let scale = TARGET_LONG / longSide;
      if (scale > 2) scale = 2;     // small rounds: don't upscale beyond 2x
      if (scale < 0.5) scale = 0.5; // very large rounds: floor so it's not unreadable

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(totalH * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, totalH);
      ctx.textBaseline = 'top';

      const fit = (text, maxW) => {
        text = String(text || '');
        if (ctx.measureText(text).width <= maxW) return text;
        while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        return text + '…';
      };

      // GRAND HEADER
      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(0, 0, width, grandHeaderH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillText('ALL DELIVERIES', 16, 14);
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText('Week of ' + formatUKDate(selectedDate) + '  •  ' + driverNames.length + ' drivers', 16, 44);
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText('Stops: ' + gStops + '      Chicken: ' + gC + '      Meat: ' + gM + (showPies ? '      Pies: ' + gP : ''), 16, 72);

      // SUMMARY TABLE
      let ty = grandHeaderH + 12;
      ctx.fillStyle = '#222222';
      ctx.font = 'bold 13px Arial, sans-serif';
      const colName = 16, colStops = 320, colC = 400, colM = 470, colP = 540;
      ctx.fillText('Driver', colName, ty);
      ctx.fillText('Stops', colStops, ty);
      ctx.fillText('🍗', colC, ty);
      ctx.fillText('🍖', colM, ty);
      if (showPies) ctx.fillText('🥧', colP, ty);
      ty += 8;
      ctx.strokeStyle = '#333333'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(16, ty + 12); ctx.lineTo(width - 16, ty + 12); ctx.stroke();
      ty += tableRowH;
      ctx.font = '13px Arial, sans-serif';
      driverNames.forEach((d) => {
        const t = perDriver[d];
        ctx.fillStyle = '#111111';
        ctx.fillText(fit(d, 290), colName, ty);
        ctx.fillText(String(t.stops), colStops, ty);
        ctx.fillText(String(t.chicken), colC, ty);
        ctx.fillText(String(t.meat), colM, ty);
        if (showPies) ctx.fillText(String(t.pies), colP, ty);
        ctx.strokeStyle = '#e2e2e2'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(16, ty + 18); ctx.lineTo(width - 16, ty + 18); ctx.stroke();
        ty += tableRowH;
      });

      // Draw one driver's card at (ox, oy) within column width colW. Returns the height used.
      const drawDriver = (d, ox, oy) => {
        let y = oy;
        const keys = orderStops(allocations[d]);
        let dC = 0, dM = 0, dP = 0;
        keys.forEach((key) => { const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 }; dC += c.chicken; dM += c.meat; dP += c.pies; });

        // bold RED divider at the top of the card
        ctx.strokeStyle = '#c62828'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(ox, y - 8); ctx.lineTo(ox + colW, y - 8); ctx.stroke();

        ctx.fillStyle = '#222222';
        ctx.font = 'bold 21px Arial, sans-serif';
        ctx.fillText(fit(d, colW - 120), ox, y);
        ctx.font = '13px Arial, sans-serif';
        ctx.fillStyle = '#666666';
        ctx.fillText(keys.length + ' stops', ox, y + 24);
        ctx.strokeStyle = '#333333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ox, y + driverHeaderH - 8); ctx.lineTo(ox + colW, y + driverHeaderH - 8); ctx.stroke();
        y += driverHeaderH;

        keys.forEach((key, idx) => {
          const a = addresses[key] || {};
          const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
          if (idx % 2 === 1) { ctx.fillStyle = '#e3edf7'; ctx.fillRect(ox - 4, y - 6, colW + 8, rowH); }
          ctx.fillStyle = '#111111';
          ctx.font = 'bold 17px Arial, sans-serif';
          ctx.fillText(fit((a.fullAddress || key) + (a.postcode ? '  ' + a.postcode : ''), colW - 8), ox, y);
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillStyle = '#222222';
          ctx.fillText('Chicken: ' + c.chicken + '    Meat: ' + c.meat + (showPies ? '    Pies: ' + c.pies : ''), ox, y + 21);
          if (a.notes) {
            ctx.font = 'bold italic 14px Arial, sans-serif';
            ctx.fillStyle = '#c0392b';
            ctx.fillText(fit('Note: ' + a.notes, colW - 8), ox, y + 42);
          }
          ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ox, y + rowH - 8); ctx.lineTo(ox + colW, y + rowH - 8); ctx.stroke();
          y += rowH;
        });

        // totals box
        y += 4;
        ctx.fillStyle = '#eef6ee';
        ctx.fillRect(ox - 4, y, colW + 8, driverTotalsH - 12);
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2;
        ctx.strokeRect(ox - 4, y, colW + 8, driverTotalsH - 12);
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText('Collect — Chicken: ' + dC + '   Meat: ' + dM + (showPies ? '   Pies: ' + dP : '') + '   (Stops: ' + keys.length + ')', ox + 6, y + 10);
        y += driverTotalsH - 12 + driverGap;
        return y - oy;
      };

      // Render the columns
      const startY = grandHeaderTotalH + 12;
      const colX = [];
      for (let c = 0; c < NUM_COLS; c++) colX.push(16 + c * (colW + colGap));
      for (let ci = 0; ci < NUM_COLS; ci++) {
        let y = startY;
        colDrivers[ci].forEach((d) => { y += drawDriver(d, colX[ci], y + 8); });
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error('Could not create image'));
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });

  // Lazy-load jsPDF from CDN (so no package.json change is needed for the single-file workflow).
  const loadJsPDF = () => new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) { resolve(window.jspdf.jsPDF); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error('jsPDF failed to load'));
    };
    s.onerror = () => reject(new Error('Could not load jsPDF'));
    document.body.appendChild(s);
  });

  // Build a crisp, vector A4-portrait PDF of all deliveries in two columns. PDFs aren't
  // recompressed by WhatsApp (sent as a document), so text stays sharp.
  const buildAllPdf = async () => {
    const JsPDF = await loadJsPDF();
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = 210, pageH = 297, margin = 10;
    const colGap = 8;
    const colW = (pageW - margin * 2 - colGap) / 2; // two columns
    const colX = [margin, margin + colW + colGap];
    const showPiesGlobal = (() => {
      let p = 0;
      Object.keys(allocations).forEach(d => { if (d !== '__unassigned') (allocations[d] || []).forEach(k => { p += (calculatedAddresses[k] || {}).pies || 0; }); });
      return p > 0;
    })();

    // Only include stops that are still active this week — an address on hold / excluded /
    // with nothing to deliver drops out of calculatedAddresses, so it must not appear in the
    // PDF (not even showing 0). activeKeysFor(d) gives a driver's live stops.
    const activeKeysFor = (d) => (allocations[d] || []).filter((k) => calculatedAddresses[k]);

    const driverNames = Object.keys(allocations).filter((d) => d !== '__unassigned' && activeKeysFor(d).length > 0);

    // Header band
    doc.setFillColor(27, 94, 32); doc.rect(0, 0, pageW, 20, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('ALL DELIVERIES', margin, 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Week of ' + formatUKDate(selectedDate) + '  •  ' + driverNames.length + ' drivers', margin, 15);
    doc.setFontSize(7); doc.text('v2', pageW - margin, 15, { align: 'right' }); doc.setFontSize(10);

    // Grand totals + per-driver figures
    let gStops = 0, gC = 0, gM = 0, gP = 0;
    const perDriver = {};
    driverNames.forEach((d) => {
      let s = 0, c = 0, m = 0, p = 0;
      activeKeysFor(d).forEach((k) => { const q = calculatedAddresses[k] || {}; s += 1; c += q.chicken || 0; m += q.meat || 0; p += q.pies || 0; });
      perDriver[d] = { stops: s, chicken: c, meat: m, pies: p };
      gStops += s; gC += c; gM += m; gP += p;
    });

    // Grand totals line under the header band
    let hy = 26;
    doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Totals — Stops: ' + gStops + '    Chicken: ' + gC + '    Meat: ' + gM + (showPiesGlobal ? '    Pies: ' + gP : ''), margin, hy);
    hy += 6;

    // Per-driver summary table — compact columns, with zebra shading for readability.
    const sCols = showPiesGlobal
      ? [margin + 2, margin + 58, margin + 78, margin + 98, margin + 118]
      : [margin + 2, margin + 58, margin + 80, margin + 102];
    const tableRight = (showPiesGlobal ? margin + 130 : margin + 114);
    const sRowH = 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60);
    doc.text('Driver', sCols[0], hy);
    doc.text('Stops', sCols[1], hy);
    doc.text('Chick', sCols[2], hy);
    doc.text('Meat', sCols[3], hy);
    if (showPiesGlobal) doc.text('Pies', sCols[4], hy);
    hy += 1.5;
    doc.setDrawColor(80); doc.setLineWidth(0.3); doc.line(margin, hy, tableRight, hy); hy += 3.5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20);
    driverNames.forEach((d, ri) => {
      if (ri % 2 === 1) { doc.setFillColor(238, 240, 244); doc.rect(margin, hy - 3.4, tableRight - margin, sRowH, 'F'); }
      const t = perDriver[d];
      doc.setTextColor(20);
      doc.text(String(d).slice(0, 26), sCols[0], hy);
      doc.text(String(t.stops), sCols[1], hy);
      doc.text(String(t.chicken), sCols[2], hy);
      doc.text(String(t.meat), sCols[3], hy);
      if (showPiesGlobal) doc.text(String(t.pies), sCols[4], hy);
      hy += sRowH;
    });
    hy += 1;
    doc.setDrawColor(120); doc.setLineWidth(0.4); doc.line(margin, hy, tableRight, hy);
    hy += 8; // breathing room before the first driver's red divider

    let col = 0;
    let y = [hy, hy];
    const lineH = 4.6;

    driverNames.forEach((d) => {
      const keys = orderStops(activeKeysFor(d));
      let dC = 0, dM = 0, dP = 0;
      keys.forEach((k) => { const q = calculatedAddresses[k] || {}; dC += q.chicken || 0; dM += q.meat || 0; dP += q.pies || 0; });

      // Packing groups: how many stops share each order combination, for easy batching when
      // handing over parcels — same as the individual driver images.
      const comboCounts = {};
      keys.forEach((key) => {
        const q = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
        if ((q.chicken + q.meat + q.pies) === 0) return;
        const partsArr = [];
        if (q.chicken) partsArr.push(q.chicken + ' Chicken');
        if (q.meat) partsArr.push(q.meat + ' Meat');
        if (q.pies) partsArr.push(q.pies + ' Pies');
        const label = partsArr.join(', ');
        comboCounts[label] = (comboCounts[label] || 0) + 1;
      });
      const comboList = Object.keys(comboCounts)
        .map((label) => ({ label, count: comboCounts[label] }))
        .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
      const comboLineH = 4.2;
      const groupsBlockH = comboList.length > 0 ? (5 + comboList.length * comboLineH + 2) : 0;

      // Measure the FULL block height (header + every stop with its wrapped address/note +
      // totals + packing groups) so the whole driver stays together in one column — the
      // totals and groups never get separated onto the next column.
      let blockHeight = 5 + 5 + 5 + 3; // space + red line + name gap + header underline gap
      keys.forEach((key) => {
        const a = addresses[key] || {};
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        const aLines = doc.splitTextToSize((a.fullAddress || key) + (a.postcode ? ' ' + a.postcode : ''), colW);
        let nLines = 0;
        if (a.notes) { doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8); nLines = doc.splitTextToSize('Note: ' + a.notes, colW).length; }
        blockHeight += aLines.length * lineH + lineH + nLines * (lineH - 0.4) + 3;
      });
      blockHeight += 11; // totals box
      blockHeight += groupsBlockH; // packing groups

      // Choose the column ONCE for the whole block.
      const usable = pageH - margin;
      if (y[col] + 5 + blockHeight > usable) {
        const other = col === 0 ? 1 : 0;
        if (y[other] + 5 + blockHeight <= usable) {
          col = other;
        } else if (blockHeight <= usable - (margin + 4)) {
          // doesn't fit in either column on this page, but fits on a fresh page → new page
          doc.addPage(); y[0] = margin + 4; y[1] = margin + 4; col = 0;
        } else {
          // taller than a full page (very long round) → just place in the emptier column
          // and let it flow down the page as a last resort.
          col = (y[0] <= y[1]) ? 0 : 1;
        }
      }
      const x = colX[col];

      // space above the red divider so it isn't crammed against the previous block
      y[col] += 5;
      // red divider + driver header
      doc.setDrawColor(198, 40, 40); doc.setLineWidth(0.8);
      doc.line(x, y[col], x + colW, y[col]); y[col] += 5;
      doc.setTextColor(34); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(d, x, y[col]); 
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
      doc.text(keys.length + ' stops', x + colW, y[col], { align: 'right' });
      y[col] += 5;
      doc.setDrawColor(60); doc.setLineWidth(0.3); doc.line(x, y[col], x + colW, y[col]); y[col] += 3;

      keys.forEach((key) => {
        const a = addresses[key] || {};
        const q = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
        const addr = (a.fullAddress || key) + (a.postcode ? ' ' + a.postcode : '');
        // (column already chosen for the whole block, so this stop stays put)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        const addrLines = doc.splitTextToSize(addr, colW);
        let noteLines = [];
        if (a.notes) { doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8); noteLines = doc.splitTextToSize('Note: ' + a.notes, colW); }
        const cx = colX[col];

        doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        addrLines.forEach((ln) => { doc.text(ln, cx, y[col]); y[col] += lineH; });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(50);
        doc.text('Chicken: ' + q.chicken + '   Meat: ' + q.meat + (showPiesGlobal ? '   Pies: ' + q.pies : ''), cx, y[col]); y[col] += lineH;
        if (noteLines.length > 0) {
          doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8); doc.setTextColor(192, 57, 43);
          noteLines.forEach((ln) => { doc.text(ln, cx, y[col]); y[col] += (lineH - 0.4); });
        }
        doc.setDrawColor(225); doc.setLineWidth(0.2); doc.line(cx, y[col] - 1, cx + colW, y[col] - 1); y[col] += 1.5;
      });

      // totals — stays in the same column as the driver's stops
      const tx = colX[col];
      doc.setFillColor(238, 246, 238); doc.setDrawColor(76, 175, 80); doc.setLineWidth(0.4);
      doc.rect(tx, y[col], colW, 7, 'FD');
      doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text('Chicken: ' + dC + '   Meat: ' + dM + (showPiesGlobal ? '   Pies: ' + dP : '') + '   (Stops: ' + keys.length + ')', tx + 2, y[col] + 4.6);
      y[col] += 11;

      // packing groups — grouped order combinations for easy parcel batching
      if (comboList.length > 0) {
        const gx = colX[col];
        doc.setTextColor(27, 94, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text('PACKING GROUPS', gx, y[col]); y[col] += 4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(34);
        comboList.forEach((g) => {
          doc.text('• ' + g.label + '  =  ' + g.count + (g.count === 1 ? ' stop' : ' stops'), gx + 1, y[col]);
          y[col] += comboLineH;
        });
        y[col] += 2;
      }
    });

    return doc;
  };

  const shareAllPdf = async () => {
    try {
      const doc = await buildAllPdf();
      const blob = doc.output('blob');
      const file = new File([blob], 'all-deliveries.pdf', { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: 'All deliveries — week of ' + formatUKDate(selectedDate) });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not create the PDF: ' + e.message);
    }
  };

  const downloadAllPdf = async () => {
    try {
      const doc = await buildAllPdf();
      doc.save('all-deliveries.pdf');
    } catch (e) {
      alert('Could not create the PDF: ' + e.message);
    }
  };

  const shareAllImage = async () => {
    try {
      const blob = await rasteriseAllToPng();
      const file = new File([blob], 'all-deliveries.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: 'All deliveries — week of ' + formatUKDate(selectedDate) });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = file.name; link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not generate the combined image: ' + e.message);
    }
  };

  const downloadAllImage = async () => {
    try {
      const blob = await rasteriseAllToPng();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'all-deliveries.png'; link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not generate the combined image: ' + e.message);
    }
  };

  // Shorten a long URL via TinyURL (free, no key, CORS-friendly from the browser).
  // Falls back to the original on any failure so the route link always works.
  // Our OWN URL shortener, built on the app's Firebase database — no third-party service,
  // so no CORS failures, rate limits, or outages. We store the long URL under a short code
  // in the `shortlinks` node, and a tiny redirect page (/r.html) forwards the driver to it.
  // The short link is https://<your-domain>/r/<code>. If the DB write fails for any reason,
  // we fall back to the full Maps URL (which still works, just longer).
  const shortenUrl = async (longUrl) => {
    try {
      if (!db) return longUrl;
      // Reuse an existing code if this exact URL was already shortened (keeps things tidy).
      // Otherwise generate a short random code and store the mapping.
      const code = Math.random().toString(36).slice(2, 8); // 6 chars, e.g. "x7k2ab"
      await set(ref(db, 'shortlinks/' + code), { url: longUrl, at: new Date().toISOString() });
      return window.location.origin + '/r.html?c=' + code;
    } catch (e) {
      console.error('shortlink write failed (check DB rules for /shortlinks):', e);
      return longUrl;
    }
  };

  const buildDriverCaptionAsync = async (driverName, keys) => {
    const header = deliveryMessage
      .replace(/\{DRIVER\}/g, driverName)
      .replace(/\{DATE\}/g, formatUKDate(selectedDate))
      .replace(/\{STOPS\}/g, keys.length);
    const route = buildRouteLink(keys);
    if (!route) return header;
    const shortRoute = await shortenUrl(route);
    return header + `\n\n🗺️ Route: ${shortRoute}`;
  };

  const shareDriver = async (driverName, keys) => {
    const caption = await buildDriverCaptionAsync(driverName, keys);
    try {
      const blob = await rasteriseToPng(driverName, keys);
      const file = new File([blob], `delivery-${driverName.replace(/\s+/g,'-')}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        return;
      }
      // Fallback: download the image and copy the caption
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
      try { await navigator.clipboard.writeText(caption); } catch (e) {}
      alert('Your phone/browser does not support direct image sharing here. The image has been downloaded and the message copied — attach the image in WhatsApp and paste the message.');
    } catch (e) {
      alert('Could not generate the image: ' + e.message);
    }
  };

  const downloadDriverImage = async (driverName, keys) => {
    try {
      const blob = await rasteriseToPng(driverName, keys);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `delivery-${driverName.replace(/\s+/g,'-')}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not generate the image: ' + e.message);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return <div style={{ padding: '20px', fontSize: '18px' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={{ padding: '40px', maxWidth: '400px', margin: '0 auto' }}>
        <h1>🍽️ BKFG Deliveries</h1>
        <p>Admin Access Only</p>
        {authError && <div style={{ color: 'red', marginBottom: '10px' }}>{authError}</div>}
        <form onSubmit={(e) => {
            e.preventDefault();
            signInWithEmailAndPassword(auth, loginEmail, loginPassword)
              .catch((error) => setAuthError(error.message));
          }}>
          <input type="email" placeholder="Email" value={loginEmail}
            name="email" autoComplete="username"
            onChange={(e) => setLoginEmail(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Password" value={loginPassword}
            name="password" autoComplete="current-password"
            onChange={(e) => setLoginPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
          <button type="submit"
            style={{ width: '100%', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>
            Login
          </button>
        </form>
        <button onClick={() => {
            if (!loginEmail) { setAuthError('Enter your email above first, then tap "Forgot password".'); return; }
            sendPasswordResetEmail(auth, loginEmail)
              .then(() => { setAuthError(''); setResetSent(true); })
              .catch((error) => setAuthError(error.message));
          }}
          style={{ width: '100%', padding: '8px', marginTop: '10px', backgroundColor: 'transparent', color: '#1565c0', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' }}>
          Forgot password?
        </button>
        {resetSent && <div style={{ color: '#2e7d32', marginTop: '8px', fontSize: '13px' }}>If an account exists for that email, a password-reset link has been sent. Check your inbox (and spam).</div>}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🍽️ BKFG Deliveries</h1>
        <button onClick={() => signOut(auth)}
          style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd', flexWrap: 'wrap' }}>
        {['addresses', 'drivers', 'poll', 'summary', 'allocate', 'send', 'analytics', 'settings'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === tab ? '#4CAF50' : '#f0f0f0',
              color: activeTab === tab ? 'white' : 'black',
              border: 'none', cursor: 'pointer', fontSize: '14px',
              fontWeight: activeTab === tab ? 'bold' : 'normal'
            }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ADDRESSES TAB */}
      {activeTab === 'addresses' && (
        <div>
          <h2>📋 Addresses</h2>
          {(() => {
            const today = new Date().toISOString().split('T')[0];
            const activeKeys = Object.keys(addresses).filter((k) => !isOnHold(addresses[k], today));
            const sum = (which) => {
              let c = 0, m = 0, p = 0;
              activeKeys.forEach((k) => {
                const w = addresses[k][which];
                if (w) { c += (w.chicken || 0); m += (w.meat || 0); p += (w.pies || 0); }
              });
              return { c, m, p };
            };
            const a = sum('weekA'), b = sum('weekB'), f = sum('firstOfMonth');
            const heldCount = Object.keys(addresses).length - activeKeys.length;
            const box = (title, bg, border, vals) => (
              <div style={{ flex: 1, minWidth: '150px', background: bg, border: `2px solid ${border}`, borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>
                {vals === null
                  ? <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{activeKeys.length}</div>
                  : <div style={{ fontSize: '14px' }}>🍗 {vals.c} &nbsp; 🍖 {vals.m} &nbsp; 🥧 {vals.p}</div>}
              </div>
            );
            return (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
                {box('Active addresses', '#e3f2fd', '#1976d2', null)}
                {box('Week A', '#e8f5e9', '#4CAF50', a)}
                {box('Week B', '#fff3e0', '#ff9800', b)}
                {box('First of Month', '#f3e5f5', '#9c27b0', f)}
                {heldCount > 0 && (
                  <div style={{ flex: 1, minWidth: '150px', background: '#fafafa', border: '2px solid #bbb', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>On hold</div>
                    <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#888' }}>{heldCount}</div>
                  </div>
                )}
              </div>
            );
          })()}
          <h3>Addresses</h3>
          <button onClick={startAddAddress} style={{ padding: '8px 16px', marginBottom: '10px' }}>
            ➕ Add Address
          </button>

          {showAddAddress && (
            <div style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '15px' }}>
              <h4>{editingAddress?.originalKey ? 'Edit Address' : 'Add Address'}</h4>
              <input type="text" placeholder="Full Address"
                value={editingAddress?.fullAddress || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, fullAddress: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
              <input type="text" placeholder="Postcode"
                value={editingAddress?.postcode || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, postcode: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div><label>Week A Chicken</label><input type="number" value={editingAddress?.weekAChicken || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, weekAChicken: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                <div><label>Week A Meat</label><input type="number" value={editingAddress?.weekAMeat || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, weekAMeat: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                <div><label>Week A Pies</label><input type="number" value={editingAddress?.weekAPies || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, weekAPies: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div><label>Week B Chicken</label><input type="number" value={editingAddress?.weekBChicken || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, weekBChicken: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                <div><label>Week B Meat</label><input type="number" value={editingAddress?.weekBMeat || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, weekBMeat: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                <div><label>Week B Pies</label><input type="number" value={editingAddress?.weekBPies || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, weekBPies: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div><label>First of Month Chicken</label><input type="number" value={editingAddress?.firstOfMonthChicken || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, firstOfMonthChicken: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                <div><label>First of Month Meat</label><input type="number" value={editingAddress?.firstOfMonthMeat || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, firstOfMonthMeat: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                <div><label>First of Month Pies</label><input type="number" value={editingAddress?.firstOfMonthPies || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, firstOfMonthPies: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
              </div>

              <input type="text" placeholder="Name (admin only)"
                value={editingAddress?.name || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, name: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input type="number" placeholder="Adults" value={editingAddress?.adults || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, adults: e.target.value })}
                  style={{ padding: '8px', boxSizing: 'border-box' }} />
                <input type="number" placeholder="Children" value={editingAddress?.children || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, children: e.target.value })}
                  style={{ padding: '8px', boxSizing: 'border-box' }} />
              </div>

              <textarea placeholder="Notes (door codes, access info - shown to drivers)"
                value={editingAddress?.notes || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, notes: e.target.value })}
                style={{ width: '100%', padding: '8px', minHeight: '60px', marginBottom: '10px', boxSizing: 'border-box' }} />

              <div style={{ backgroundColor: '#f0f7ff', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}>
                  <strong>Location (optional)</strong> — leave blank to auto-locate from postcode. Fill in only if auto-location fails.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input type="text" placeholder="Latitude" value={editingAddress?.lat ?? ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, lat: e.target.value })}
                    style={{ padding: '8px', boxSizing: 'border-box' }} />
                  <input type="text" placeholder="Longitude" value={editingAddress?.lng ?? ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, lng: e.target.value })}
                    style={{ padding: '8px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ backgroundColor: '#f3e5f5', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}><strong>Driver preferences</strong> (used by auto-allocation).</p>
                <label style={{ fontSize: '12px' }}>Preferred driver:</label>
                <select
                  value={editingAddress?.preferredDriver || ''}
                  onChange={(e) => setEditingAddress({ ...editingAddress, preferredDriver: e.target.value })}
                  style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }}>
                  <option value="">No preference</option>
                  {Object.keys(drivers).map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
                <label style={{ fontSize: '12px' }}>Avoid these drivers:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                  {Object.keys(drivers).length === 0 && <span style={{ fontSize: '12px', color: '#999' }}>Add drivers first</span>}
                  {Object.keys(drivers).map((d) => {
                    const avoid = editingAddress?.avoidDrivers || [];
                    const checked = avoid.includes(d);
                    return (
                      <label key={d} style={{ fontSize: '13px' }}>
                        <input type="checkbox" checked={checked}
                          onChange={(e) => {
                            const cur = editingAddress?.avoidDrivers || [];
                            const next = e.target.checked ? [...cur, d] : cur.filter(x => x !== d);
                            setEditingAddress({ ...editingAddress, avoidDrivers: next });
                          }} /> {d}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ backgroundColor: '#fff8e1', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}><strong>On Hold</strong> — pause deliveries to this address.</p>
                <select
                  value={editingAddress?.hold?.type || 'none'}
                  onChange={(e) => setEditingAddress({ ...editingAddress, hold: { ...(editingAddress?.hold || {}), type: e.target.value } })}
                  style={{ padding: '8px', marginBottom: '8px' }}>
                  <option value="none">Not on hold</option>
                  <option value="permanent">On hold (permanent, until I change it)</option>
                  <option value="range">On hold between dates</option>
                </select>
                {editingAddress?.hold?.type === 'range' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><label style={{ fontSize: '12px' }}>From</label>
                      <input type="date" value={editingAddress?.hold?.from || ''}
                        onChange={(e) => setEditingAddress({ ...editingAddress, hold: { ...editingAddress.hold, from: e.target.value } })}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                    <div><label style={{ fontSize: '12px' }}>To</label>
                      <input type="date" value={editingAddress?.hold?.to || ''}
                        onChange={(e) => setEditingAddress({ ...editingAddress, hold: { ...editingAddress.hold, to: e.target.value } })}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={addOrUpdateAddress} disabled={geocoding}
                  style={{ padding: '8px 16px', backgroundColor: geocoding ? '#999' : '#4CAF50', color: 'white', border: 'none', cursor: geocoding ? 'default' : 'pointer' }}>
                  {geocoding ? 'Locating…' : 'Save Address'}
                </button>
                <button onClick={() => { setShowAddAddress(false); setEditingAddress(null); }}
                  style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '15px' }}>
            <input type="text" value={addressSearch} onChange={(e) => setAddressSearch(e.target.value)}
              placeholder="🔍 Search addresses by name or postcode..."
              style={{ width: '100%', padding: '10px', marginBottom: '12px', boxSizing: 'border-box', fontSize: '14px' }} />
            {(() => {
              const term = addressSearch.trim().toLowerCase();
              const allKeys = Object.keys(addresses);
              const keys = term
                ? allKeys.filter((k) => {
                    const a = addresses[k] || {};
                    return (a.fullAddress || '').toLowerCase().includes(term) || (a.postcode || '').toLowerCase().includes(term);
                  })
                : allKeys;
              if (term && keys.length === 0) {
                return <p style={{ color: '#888', fontSize: '13px' }}>No addresses match "{addressSearch}".</p>;
              }
              return keys.map((key) => {
              const a = addresses[key];
              const held = isOnHold(a, selectedDate);
              return (
                <div key={key} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', backgroundColor: held ? '#fff3e0' : 'white' }}>
                  <strong>{a.fullAddress}</strong>
                  {a.postcode && <span style={{ marginLeft: '8px', color: '#777', fontSize: '12px' }}>{a.postcode}</span>}
                  {a.needsLocation && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#e65100', fontWeight: 'bold' }}>⚠ needs location</span>}
                  {a.hold && a.hold.type && a.hold.type !== 'none' && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: '#e65100', fontWeight: 'bold' }}>
                      ⏸ on hold{a.hold.type === 'range' ? ` ${formatUKDate(a.hold.from)}–${formatUKDate(a.hold.to)}` : ' (permanent)'}
                    </span>
                  )}
                  <p style={{ margin: '5px 0', fontSize: '12px' }}>
                    <strong>Week A:</strong> {a.weekA.chicken}🍗 {a.weekA.meat}🍖 {a.weekA.pies}🥧<br />
                    <strong>Week B:</strong> {a.weekB.chicken}🍗 {a.weekB.meat}🍖 {a.weekB.pies}🥧<br />
                    <strong>First of Month:</strong> {(a.firstOfMonth?.chicken) || 0}🍗 {(a.firstOfMonth?.meat) || 0}🍖 {(a.firstOfMonth?.pies) || 0}🥧
                  </p>
                  {a.notes && <p style={{ margin: '5px 0', fontSize: '11px', color: '#c62828' }}>📝 {a.notes}</p>}
                  {a.preferredDriver && <p style={{ margin: '3px 0', fontSize: '11px', color: '#2e7d32' }}>⭐ Preferred: {a.preferredDriver}</p>}
                  {a.avoidDrivers && a.avoidDrivers.length > 0 && <p style={{ margin: '3px 0', fontSize: '11px', color: '#c62828' }}>🚫 Avoid: {a.avoidDrivers.join(', ')}</p>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => startEditAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>Edit</button>
                    <a href={singleMapLink(key)} target="_blank" rel="noopener noreferrer" style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#0F9D58', color: 'white', border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>📍 Map</a>
                    {a.needsLocation && <button onClick={() => locateAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#FF9800', color: 'white', border: 'none', cursor: 'pointer' }}>Locate</button>}
                    <button onClick={() => deleteAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              );
              });
            })()}
          </div>
        </div>
      )}

      {/* DRIVERS TAB */}
      {activeTab === 'drivers' && (
        <div>
          <h2>🚗 Drivers</h2>
          <h3 style={{ marginTop: '0' }}>Drivers</h3>
          <button onClick={startAddDriver} style={{ padding: '8px 16px', marginBottom: '10px' }}>➕ Add Driver</button>

          {showAddDriver && (
            <div style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '15px' }}>
              <h4>{editingDriverOriginal ? 'Edit Driver' : 'Add Driver'}</h4>
              <input type="text" placeholder="Driver Name" value={editingDriverName}
                onChange={(e) => setEditingDriverName(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
              <input type="text" placeholder="Phone (e.g. 07700 123456)" value={editingDriverPhone}
                onChange={(e) => setEditingDriverPhone(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={addOrUpdateDriver} style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>Save Driver</button>
                <button onClick={() => { setShowAddDriver(false); setEditingDriverName(''); setEditingDriverPhone(''); setEditingDriverOriginal(null); }}
                  style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '15px' }}>
            {Object.keys(drivers).map((name) => (
              <div key={name} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{name}</strong>
                  {driverPhones[name] && <span style={{ marginLeft: '10px', color: '#666', fontSize: '13px' }}>📞 {driverPhones[name]}</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEditDriver(name)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => deleteDriver(name)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* POLL TAB */}
      {activeTab === 'poll' && (
        <div>
          <h2>📋 Select Delivery Date</h2>
          <div style={{ marginBottom: '20px' }}>
            <label>Delivery Date:</label>
            <input type="date" value={selectedDate || ''}
              onChange={(e) => handleDateSelection(e.target.value)}
              style={{ padding: '8px', fontSize: '16px' }} />
          </div>

          {selectedDate && (
            <>
              <div style={{ backgroundColor: '#e8f5e9', padding: '15px', marginBottom: '20px', borderRadius: '4px' }}>
                <strong>Week Detected:</strong> {detectedWeekType}{detectedFirstOfMonth ? ' + First of Month' : ''}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label>Delivery Type:</label>
                <div>
                  <label style={{ marginRight: '20px' }}><input type="radio" value="single" checked={deliveryType === 'single'} onChange={(e) => setDeliveryType(e.target.value)} /> Single</label>
                  <label style={{ marginRight: '20px' }}><input type="radio" value="double" checked={deliveryType === 'double'} onChange={(e) => setDeliveryType(e.target.value)} /> Double</label>
                  <label><input type="radio" value="triple" checked={deliveryType === 'triple'} onChange={(e) => setDeliveryType(e.target.value)} /> Triple</label>
                </div>
              </div>

              <div style={{ backgroundColor: '#fff8e1', padding: '15px', marginBottom: '20px', borderRadius: '4px', border: '1px solid #ffe082' }}>
                <h3 style={{ marginTop: 0 }}>Driver Availability Poll</h3>
                <p style={{ fontSize: '13px', color: '#666' }}>
                  Opens a poll for this date. Drivers confirm their mobile number, then vote. Phone numbers are stored only as a secure fingerprint, never in the open.
                </p>
                {!activePollId ? (
                  <button onClick={openPollForVoting}
                    style={{ padding: '10px 20px', backgroundColor: '#FF9800', color: 'white', border: 'none', cursor: 'pointer' }}>
                    📣 Open Poll for Voting
                  </button>
                ) : (
                  <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #4CAF50', borderRadius: '4px', padding: '10px', marginBottom: '10px', fontSize: '13px' }}>
                    🔒 <strong>A poll is already live.</strong> It's locked so responses aren't lost on refresh or another device. To replace it, use "Start a new poll" below.
                  </div>
                )}
                {activePollId && (
                  <div style={{ marginTop: '15px' }}>
                    <p style={{ margin: '5px 0', fontSize: '13px' }}><strong>Poll is live</strong> for {formatUKDate(activePollId.split('-').slice(0,3).join('-'))}{activePollId.split('-').slice(0,3).join('-') !== selectedDate ? ' — note: this is different from the date currently selected above' : ''}. Share this link with your drivers:</p>
                    <p style={{ margin: '5px 0', fontSize: '13px', color: isPollClosed(activePollId.split('-').slice(0,3).join('-')) ? '#c62828' : '#2e7d32' }}>
                      {isPollClosed(activePollId.split('-').slice(0,3).join('-'))
                        ? `🔴 Poll closed (deadline was ${formatCutoff(activePollId.split('-').slice(0,3).join('-'))}). Late changes via the Allocate tab.`
                        : `⏰ Closes ${formatCutoff(activePollId.split('-').slice(0,3).join('-'))}`}
                    </p>
                    {(() => {
                      const names = Object.keys(drivers);
                      let yes = 0, no = 0, waiting = 0;
                      names.forEach((name) => {
                        const dv = getDriverVote(name);
                        const v = dv ? dv.available : null;
                        if (v === true) yes++;
                        else if (v === false) no++;
                        else waiting++;
                      });
                      const pill = (label, count, bg, border) => (
                        <span style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: '14px', padding: '3px 12px', fontSize: '13px', fontWeight: 'bold' }}>{label} {count}</span>
                      );
                      return (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0 4px' }}>
                          {pill('✅ Yes', yes, '#e8f5e9', '#4CAF50')}
                          {pill('❌ No', no, '#ffebee', '#e53935')}
                          {pill('⏳ No vote', waiting, '#f5f5f5', '#bbb')}
                        </div>
                      );
                    })()}
                    <input type="text" readOnly value={`${window.location.origin}/vote.html?poll=${activePollId}`}
                      style={{ width: '100%', padding: '8px', boxSizing: 'border-box', fontSize: '13px' }}
                      onFocus={(e) => e.target.select()} />
                    <button onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/vote.html?poll=${activePollId}`);
                        setCopiedMessage('Link copied!');
                        setTimeout(() => setCopiedMessage(''), 2000);
                      }}
                      style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>
                      Copy Link
                    </button>
                    {copiedMessage && <span style={{ marginLeft: '10px', color: 'green' }}>{copiedMessage}</span>}
                    <div style={{ marginTop: '12px' }}>
                      <button onClick={() => {
                          const pollDateStr = activePollId.split('-').slice(0,3).join('-');
                          const link = `${window.location.origin}/vote.html?poll=${activePollId}`;
                          const msg = pollMessage
                            .replace(/\{DATE\}/g, formatUKDate(pollDateStr))
                            .replace(/\{CUTOFF\}/g, formatCutoff(pollDateStr))
                            .replace(/\{LINK\}/g, link);
                          navigator.clipboard.writeText(msg);
                          setCopiedMessage('Message copied!');
                          setTimeout(() => setCopiedMessage(''), 2000);
                        }}
                        style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
                        📋 Copy poll message (with link and deadline)
                      </button>
                      <button onClick={async () => {
                          const pollDateStr = activePollId.split('-').slice(0,3).join('-');
                          const link = `${window.location.origin}/vote.html?poll=${activePollId}`;
                          const msg = pollMessage
                            .replace(/\{DATE\}/g, formatUKDate(pollDateStr))
                            .replace(/\{CUTOFF\}/g, formatCutoff(pollDateStr))
                            .replace(/\{LINK\}/g, link);
                          // Prefer the native share sheet (mobile) so the user can pick WhatsApp,
                          // a group, or any app. Fall back to a direct WhatsApp link otherwise.
                          try {
                            if (navigator.share) {
                              await navigator.share({ text: msg });
                              return;
                            }
                          } catch (e) {
                            if (e && e.name === 'AbortError') return; // user cancelled the share sheet
                          }
                          window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
                        }}
                        style={{ marginLeft: '8px', marginTop: '8px', padding: '8px 16px', backgroundColor: '#25D366', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                        📲 Share to WhatsApp
                      </button>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <button onClick={() => {
                          if (window.confirm('Start a NEW poll? This replaces the current poll link and discards the responses collected so far. Only do this if you want to start fresh.')) {
                            openPollForVoting();
                          }
                        }}
                        style={{ padding: '8px 16px', backgroundColor: '#fff', color: '#c62828', border: '1px solid #c62828', cursor: 'pointer', fontSize: '13px' }}>
                        ⟳ Start a new poll (replaces current)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* SUMMARY TAB */}
      {activeTab === 'summary' && (
        <div>
          <h2>📊 Summary</h2>
          {selectedDate ? (
            <>
              <div style={{ backgroundColor: '#f5f5f5', padding: '15px', marginBottom: '15px', borderRadius: '4px' }}>
                <strong>Delivery Date:</strong> {formatUKDate(selectedDate)}<br />
                <strong>Week:</strong> {detectedWeekType}{detectedFirstOfMonth ? ' + First of Month' : ''}<br />
                <strong>Type:</strong> {deliveryType.charAt(0).toUpperCase() + deliveryType.slice(1)}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div style={{ flex: 1, minWidth: '120px', backgroundColor: '#e8f5e9', border: '2px solid #43a047', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{(() => {
                    return Object.keys(addresses).filter((key) => {
                      if (isOnHold(addresses[key], selectedDate)) return false;
                      const dateOv = (weekOverrides && weekOverrides[selectedDate] && weekOverrides[selectedDate][key]) || {};
                      if (dateOv.excluded) return false;
                      const calc = calculatedAddresses[key];
                      const total = calc ? (calc.chicken + calc.meat + calc.pies) : 0;
                      return total > 0;
                    }).length;
                  })()}</div>
                  <div style={{ fontSize: '13px', color: '#666' }}>📍 Stops</div>
                </div>
                <div style={{ flex: 1, minWidth: '120px', backgroundColor: '#fff8e1', border: '2px solid #ffb300', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{weekTotals.chicken}</div>
                  <div style={{ fontSize: '13px', color: '#666' }}>🍗 Chicken</div>
                </div>
                <div style={{ flex: 1, minWidth: '120px', backgroundColor: '#ffebee', border: '2px solid #e53935', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{weekTotals.meat}</div>
                  <div style={{ fontSize: '13px', color: '#666' }}>🍖 Meat</div>
                </div>
                <div style={{ flex: 1, minWidth: '120px', backgroundColor: '#efebe9', border: '2px solid #8d6e63', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{weekTotals.pies}</div>
                  <div style={{ fontSize: '13px', color: '#666' }}>🥧 Pies</div>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '-12px', marginBottom: '20px' }}>These totals match the butcher email at the bottom of this page.</p>
              <h3>Addresses</h3>
              <p style={{ fontSize: '13px', color: '#666' }}>You can override quantities or exclude an address for this week only. Overrides apply to this date and feed both the butcher order and driver lists. They don't change the standing pattern.</p>
              <div style={{ marginBottom: '20px' }}>
                {Object.keys(addresses).map((key) => {
                  const dateOv = (weekOverrides && weekOverrides[selectedDate] && weekOverrides[selectedDate][key]) || {};
                  const calc = calculatedAddresses[key];
                  const excluded = !!dateOv.excluded;
                  // Held addresses are still SHOWN here (greyed out and clearly badged) so you
                  // can see at a glance that they're paused, rather than them silently vanishing.
                  const heldNow = isOnHold(addresses[key], selectedDate);
                  const total = calc ? (calc.chicken + calc.meat + calc.pies) : 0;
                  const zeroThisWeek = !excluded && !heldNow && total === 0;
                  const holdInfo = addresses[key].hold || {};
                  return (
                    <div key={key} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', backgroundColor: heldNow ? '#eceff1' : (excluded ? '#fafafa' : (zeroThisWeek ? '#e8e8e8' : (calc && calc.overridden ? '#fffde7' : 'white'))) }}>
                      <strong style={{ textDecoration: (excluded || heldNow) ? 'line-through' : 'none', color: heldNow ? '#666' : 'inherit' }}>{addresses[key].fullAddress}{addresses[key].postcode ? ' ' + addresses[key].postcode : ''}</strong>
                      {heldNow && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#fff', fontWeight: 'bold', backgroundColor: '#607d8b', padding: '2px 8px', borderRadius: '4px' }}>
                        ⏸ ON HOLD{holdInfo.type === 'permanent' ? ' (permanent)' : (holdInfo.to ? ' until ' + formatUKDate(holdInfo.to) : '')}
                      </span>}
                      {(() => {
                        const a = addresses[key];
                        const has = (w) => a[w] && (a[w].chicken || a[w].meat || a[w].pies);
                        const weeks = [];
                        if (has('weekA')) weeks.push('A');
                        if (has('weekB')) weeks.push('B');
                        if (has('firstOfMonth')) weeks.push('1st');
                        if (weeks.length === 0) return null;
                        // Only-this-pattern addresses are the useful sense-check (e.g. "only Week B")
                        const onlyOne = weeks.length === 1;
                        const label = onlyOne ? `only ${weeks[0] === '1st' ? '1st of month' : 'Week ' + weeks[0]}` : 'Weeks ' + weeks.join('/');
                        // Is this pattern active for the current delivery?
                        const activeNow = (weeks.includes('A') && detectedWeekType === 'A') || (weeks.includes('B') && detectedWeekType === 'B') || (weeks.includes('1st') && detectedFirstOfMonth);
                        return <span style={{ marginLeft: '8px', fontSize: '11px', color: activeNow ? '#1565c0' : '#999', fontWeight: onlyOne ? 'bold' : 'normal', backgroundColor: onlyOne ? '#e3f2fd' : 'transparent', padding: onlyOne ? '1px 6px' : 0, borderRadius: '4px' }}>{label}</span>;
                      })()}
                      {calc && calc.overridden && !excluded && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#f57f17', fontWeight: 'bold' }}>✎ overridden this week</span>}
                      {excluded && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#999', fontWeight: 'bold' }}>excluded this week</span>}
                      {zeroThisWeek && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#555', fontWeight: 'bold' }}>no items this week (you can add a one-off below)</span>}
                      {!excluded && !heldNow && (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                          <label style={{ fontSize: '12px' }}>🍗 <input type="number" style={{ width: '55px', padding: '4px' }}
                            value={dateOv.chicken != null ? dateOv.chicken : (calc ? calc.chicken : 0)}
                            onChange={(e) => setOverrideField(key, 'chicken', e.target.value)} /></label>
                          <label style={{ fontSize: '12px' }}>🍖 <input type="number" style={{ width: '55px', padding: '4px' }}
                            value={dateOv.meat != null ? dateOv.meat : (calc ? calc.meat : 0)}
                            onChange={(e) => setOverrideField(key, 'meat', e.target.value)} /></label>
                          <label style={{ fontSize: '12px' }}>🥧 <input type="number" style={{ width: '55px', padding: '4px' }}
                            value={dateOv.pies != null ? dateOv.pies : (calc ? calc.pies : 0)}
                            onChange={(e) => setOverrideField(key, 'pies', e.target.value)} /></label>
                          {(calc && calc.overridden) && <button onClick={() => clearOverride(key)} style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#9e9e9e', color: 'white', border: 'none', cursor: 'pointer' }}>Reset</button>}
                        </div>
                      )}
                      {addresses[key].notes && <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#c62828' }}>📝 {addresses[key].notes}</p>}
                      <div style={{ marginTop: '8px' }}>
                        <button onClick={() => toggleExcludeAddress(key)} style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: excluded ? '#4CAF50' : '#ff9800', color: 'white', border: 'none', cursor: 'pointer' }}>
                          {excluded ? 'Include this week' : 'Exclude this week'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <h3>Butcher Email</h3>
              <textarea value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)}
                style={{ width: '100%', minHeight: '200px', padding: '10px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
              <button onClick={() => {
                  navigator.clipboard.writeText(emailTemplate);
                  setCopiedMessage('Copied!');
                  setTimeout(() => setCopiedMessage(''), 2000);
                }}
                style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>
                Copy Email
              </button>
              <a href={`mailto:${encodeURIComponent(butcherEmailAddress)}?subject=${encodeURIComponent('Delivery order for ' + formatUKDate(selectedDate))}&body=${encodeURIComponent(emailTemplate)}`}
                style={{ marginTop: '10px', marginLeft: '10px', padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
                ✉️ Open in Email
              </a>
              {!butcherEmailAddress && <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>Tip: add the butcher's email address in Settings to pre-fill the recipient.</p>}
              {copiedMessage && <span style={{ marginLeft: '10px', color: 'green' }}>{copiedMessage}</span>}
            </>
          ) : (<p>Select a delivery date in the Poll tab first.</p>)}
        </div>
      )}

      {/* ALLOCATE TAB */}
      {activeTab === 'allocate' && (
        <div>
          <h2>🚚 Allocate Deliveries</h2>
          {!selectedDate ? (
            <p>Select a delivery date in the Poll tab first.</p>
          ) : (
            <>
              <div style={{ backgroundColor: '#f5f5f5', padding: '15px', marginBottom: '15px', borderRadius: '4px' }}>
                <strong>Delivery Date:</strong> {formatUKDate(selectedDate)} &nbsp;|&nbsp;
                <strong>Stops:</strong> {Object.keys(calculatedAddresses).length}
              </div>

              {activePollId && (() => {
                const names = Object.keys(drivers);
                let yes = 0, no = 0, waiting = 0;
                names.forEach((name) => {
                  const dv = getDriverVote(name);
                  let v = dv ? dv.available : null;
                  // "Available" = currently ticked (reflects votes + any admin override).
                  if (availableDrivers[name]) yes++;
                  else if (v === false) no++;
                  else if (v === true) no++; // voted yes but currently unticked -> excluded
                  else waiting++;
                });
                return (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '15px' }}>
                    <div style={{ flex: 1, minWidth: '110px', backgroundColor: '#e8f5e9', border: '2px solid #4CAF50', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{yes}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>✅ Available</div>
                    </div>
                    <div style={{ flex: 1, minWidth: '110px', backgroundColor: '#ffebee', border: '2px solid #e53935', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{no}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>❌ Not available</div>
                    </div>
                    <div style={{ flex: 1, minWidth: '110px', backgroundColor: '#f5f5f5', border: '2px solid #9e9e9e', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{waiting}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>⏳ Not responded</div>
                    </div>
                  </div>
                );
              })()}

              {/* Availability */}
              <h3>1. Driver Availability</h3>
              <p style={{ fontSize: '13px', color: '#666' }}>
                {activePollId ? 'Showing poll responses. Use “Edit availability” to manually override.' : 'No active poll — turn on Edit availability to tick who is available.'}
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {activePollId && (
                  <button onClick={seedAvailabilityFromVotes}
                    style={{ padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>
                    ↺ Load poll results
                  </button>
                )}
                <button onClick={() => setAvailabilityEditMode(m => !m)}
                  style={{ padding: '8px 16px', backgroundColor: availabilityEditMode ? '#e65100' : '#fff', color: availabilityEditMode ? 'white' : '#e65100', border: '2px solid #e65100', cursor: 'pointer', fontWeight: 'bold' }}>
                  {availabilityEditMode ? '🔓 Editing — click to lock' : '🔒 Edit availability'}
                </button>
              </div>
              {availabilityEditMode && <p style={{ fontSize: '12px', color: '#e65100', marginTop: 0 }}>Edit mode on — tick/untick to override. Overriding a driver's own vote will ask for confirmation.</p>}
              <div style={{ marginBottom: '20px' }}>
                {Object.keys(drivers).length === 0 && <p style={{ color: '#999' }}>Add drivers first.</p>}
                {Object.keys(drivers).length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      <tr style={{ background: '#f0f0f0' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #333', width: '36px' }}>{availabilityEditMode ? '✓?' : ''}</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #333' }}>Driver</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #333' }}>Status</th>
                      </tr>
                      {Object.keys(drivers).map((name) => {
                        const dvote = getDriverVote(name);
                        let voted = dvote ? dvote.available : null;
                        let byAdmin = dvote ? dvote.by === 'admin' : false;
                        const ticked = !!availableDrivers[name];
                        const voteTime = dvote && dvote.at ? new Date(dvote.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
                        return (
                          <tr key={name} style={{ borderBottom: '1px solid #e2e2e2' }}>
                            <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                              {availabilityEditMode
                                ? <input type="checkbox" checked={ticked} onChange={() => toggleDriverAvailable(name)} style={{ width: '18px', height: '18px' }} />
                                : (ticked
                                    ? <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>✓</span>
                                    : (voted === false ? <span style={{ color: '#c62828', fontWeight: 'bold' }}>✗</span> : <span style={{ color: '#ccc' }}>○</span>))}
                            </td>
                            <td style={{ padding: '8px 6px', verticalAlign: 'top' }}><strong>{name}</strong></td>
                            <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                              {voted === true && !byAdmin && <span style={{ color: 'green' }}>✓ voted available</span>}
                              {voted === false && !byAdmin && <span style={{ color: '#c62828' }}>✗ voted not available</span>}
                              {voted === null && <span style={{ color: '#999' }}>no vote</span>}
                              {byAdmin && voted === true && <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✚ available (by admin)</span>}
                              {byAdmin && voted === false && <span style={{ color: '#c62828', fontWeight: 'bold' }}>✚ not available (by admin)</span>}
                              {voteTime && <span style={{ color: '#999', display: 'block', fontSize: '11px', marginTop: '2px' }}>{voteTime}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {activePollId && (() => {
                // Votes that don't match any current driver (by hash or name) — e.g. a driver
                // who voted but isn't saved in your list, or a name that changed.
                const driverHashes = {};
                Object.keys(drivers).forEach((name) => {
                  const p = driverPhones[name];
                  if (p && normalisePhone(p)) driverHashes[hashPhone(p)] = true;
                });
                const driverNames = Object.keys(drivers);
                const orphans = Object.entries(pollVotes).filter(([h, vote]) => {
                  if (!vote || !vote.name) return false;
                  if (driverHashes[h]) return false; // matches a driver by phone
                  if (driverNames.includes(vote.name)) return false; // matches by name
                  return true;
                });
                if (orphans.length === 0) return null;
                return (
                  <div style={{ backgroundColor: '#fff3e0', border: '2px solid #e65100', borderRadius: '6px', padding: '12px', marginBottom: '15px' }}>
                    <strong style={{ color: '#e65100' }}>⚠ {orphans.length} vote{orphans.length === 1 ? '' : 's'} not matched to a driver</strong>
                    <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px 0' }}>These people voted but aren't in your driver list (or their name/number changed). Add them as a driver (in the Drivers tab) with the same phone number to bring their vote in.</p>
                    {orphans.map(([h, vote]) => (
                      <div key={h} style={{ fontSize: '13px', padding: '2px 0' }}>
                        <strong>{vote.name}</strong> — {vote.by === 'admin' ? 'set by admin' : (vote.available ? '✓ available' : '✗ not available')}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Run allocation */}
              <h3>2. Auto-Allocate</h3>
              <p style={{ fontSize: '13px', color: '#666' }}>
                Balances stops evenly across available drivers, keeps each driver's stops geographically close, honours preferred and avoided drivers.
              </p>
              <button onClick={runAutoAllocation} disabled={allocationApproved}
                style={{ padding: '10px 20px', backgroundColor: allocationApproved ? '#999' : '#FF9800', color: 'white', border: 'none', cursor: allocationApproved ? 'default' : 'pointer', marginBottom: '20px' }}>
                ⚙️ Run Auto-Allocation
              </button>

              {/* Review */}
              {Object.keys(proposedAllocation).length > 0 && (
                <>
                  <h3>3. Review {allocationApproved && <span style={{ color: 'green', fontSize: '14px' }}>✓ Approved</span>}</h3>
                  {(() => {
                    let farCount = 0;
                    Object.keys(proposedAllocation).filter(d => d !== '__unassigned').forEach((driver) => {
                      const ordered = orderStops((proposedAllocation[driver] || []).filter(k => calculatedAddresses[k]));
                      for (let i = 0; i < ordered.length - 1; i++) {
                        const d = milesBetween(ordered[i], ordered[i + 1]);
                        if (d !== null && d > 1.5) farCount++;
                      }
                    });
                    if (farCount === 0) return null;
                    return (
                      <div style={{ backgroundColor: '#fff3e0', border: '2px solid #e65100', borderRadius: '6px', padding: '12px', marginBottom: '12px', color: '#e65100', fontWeight: 'bold' }}>
                        ⚠ {farCount} far {farCount === 1 ? 'jump' : 'jumps'} (over 1.5 mi) in the current plan — look for the orange ⚠ FAR markers below and reassign if needed.
                      </div>
                    );
                  })()}
                  {(() => {
                    let prefMiss = 0;
                    Object.keys(proposedAllocation).filter(d => d !== '__unassigned').forEach((driver) => {
                      (proposedAllocation[driver] || []).filter(k => calculatedAddresses[k]).forEach((key) => {
                        const a = addresses[key];
                        if (a && a.preferredDriver && a.preferredDriver !== driver && availableDrivers[a.preferredDriver]) prefMiss++;
                      });
                    });
                    if (prefMiss === 0) return null;
                    return (
                      <div style={{ backgroundColor: '#f3e5f5', border: '2px solid #6a1b9a', borderRadius: '6px', padding: '12px', marginBottom: '12px', color: '#6a1b9a', fontWeight: 'bold' }}>
                        ↪ {prefMiss} {prefMiss === 1 ? 'address is' : 'addresses are'} placed away from an available preferred driver (moved to balance counts) — look for the purple ↪ markers below and reassign if you'd prefer.
                      </div>
                    );
                  })()}
                  <p style={{ fontSize: '13px', color: '#666' }}>
                    {allocationApproved ? 'This plan is approved and locked. Unlock to make changes.' : 'Move any address to a different driver, then approve.'}
                  </p>
                  {Object.keys(proposedAllocation).filter(d => d !== '__unassigned').map((driver) => {
                    // Only show stops that are still active this week — an address put on hold,
                    // excluded, or with nothing to deliver drops out of calculatedAddresses, so
                    // it should disappear from the allocation too (not linger showing 0 of each).
                    const activeList = (proposedAllocation[driver] || []).filter((key) => calculatedAddresses[key]);
                    return (
                    <div key={driver} style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '12px', marginBottom: '12px' }}>
                      <strong>{driver}</strong> <span style={{ color: '#666', fontSize: '13px' }}>({activeList.length} stops)</span>
                      {activeList.length === 0 && <p style={{ fontSize: '12px', color: '#999', margin: '6px 0 0 0' }}>No stops</p>}
                      {(() => { const ordered = orderStops(activeList); return ordered.map((key, idx) => {
                        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                        const nextKey = ordered[idx + 1];
                        const distNext = nextKey ? milesBetween(key, nextKey) : null;
                        const farJump = distNext !== null && distNext > 1.5;
                        return (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', fontSize: '13px', borderTop: '1px solid #f0f0f0', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                              <div><strong>{addresses[key] ? addresses[key].fullAddress : key}{addresses[key] && addresses[key].postcode ? ' ' + addresses[key].postcode : ''}</strong> <a href={singleMapLink(key)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', textDecoration: 'none' }}>🗺️</a></div>
                              {addresses[key] && addresses[key].preferredDriver === driver && <div style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 'bold', marginTop: '2px' }}>⭐ Preferred address</div>}
                              {addresses[key] && addresses[key].preferredDriver && addresses[key].preferredDriver !== driver && availableDrivers[addresses[key].preferredDriver] && <div style={{ display: 'inline-block', marginTop: '4px', backgroundColor: '#f3e5f5', border: '1.5px solid #6a1b9a', borderRadius: '4px', padding: '3px 8px', fontSize: '13px', color: '#6a1b9a', fontWeight: 'bold' }}>↪ Preferred driver: {addresses[key].preferredDriver} (available) — placed here instead</div>}
                              <div style={{ color: '#444', marginTop: '2px' }}>{c.chicken}🍗 {c.meat}🍖 {c.pies}🥧</div>
                              {addresses[key] && addresses[key].notes && <div style={{ color: '#c62828', fontSize: '12px', marginTop: '2px' }}>📝 {addresses[key].notes}</div>}
                              {distNext !== null && (farJump
                                ? <div style={{ display: 'inline-block', marginTop: '4px', backgroundColor: '#fff3e0', border: '1.5px solid #e65100', borderRadius: '4px', padding: '3px 8px', fontSize: '13px', color: '#e65100', fontWeight: 'bold' }}>⚠ FAR · {distNext.toFixed(1)} mi to next</div>
                                : <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>↓ {distNext.toFixed(1)} mi to next</div>)}
                            </div>
                            {!allocationApproved && (
                              <select value={driver} onChange={(e) => reassignAddress(key, e.target.value)} style={{ padding: '4px', fontSize: '12px' }}>
                                {Object.keys(drivers).filter(d => availableDrivers[d] && !((addresses[key] && addresses[key].avoidDrivers) || []).includes(d)).map(d => {
                                  // distance from this address to the driver's NEAREST stop (how close their round is)
                                  let nearest = null;
                                  (proposedAllocation[d] || []).forEach(k2 => {
                                    if (k2 === key) return;
                                    const m = milesBetween(key, k2);
                                    if (m !== null && (nearest === null || m < nearest)) nearest = m;
                                  });
                                  return { d, nearest };
                                }).sort((a, b) => {
                                  if (a.nearest === null) return 1;
                                  if (b.nearest === null) return -1;
                                  return a.nearest - b.nearest;
                                }).map(({ d, nearest }) => (
                                  <option key={d} value={d}>{d}{nearest !== null ? ` (${nearest.toFixed(1)} mi)` : ''}{d === driver ? ' — current' : ''}</option>
                                ))}
                                <option value="__unassigned">— unassign —</option>
                              </select>
                            )}
                          </div>
                        );
                      }); })()}
                    </div>
                    );
                  })}
                  {proposedAllocation.__unassigned && proposedAllocation.__unassigned.length > 0 && (
                    <div style={{ border: '1px solid #f44336', borderRadius: '4px', padding: '12px', marginBottom: '12px', backgroundColor: '#ffebee' }}>
                      <strong style={{ color: '#c62828' }}>⚠ Unassigned ({proposedAllocation.__unassigned.length})</strong>
                      {proposedAllocation.__unassigned.map((key) => {
                        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                        return (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', fontSize: '13px', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                              <div><strong>{addresses[key] ? addresses[key].fullAddress : key}{addresses[key] && addresses[key].postcode ? ' ' + addresses[key].postcode : ''}</strong></div>
                              <div style={{ color: '#444', marginTop: '2px' }}>{c.chicken}🍗 {c.meat}🍖 {c.pies}🥧</div>
                              {addresses[key] && addresses[key].notes && <div style={{ color: '#c62828', fontSize: '12px', marginTop: '2px' }}>📝 {addresses[key].notes}</div>}
                            </div>
                            {!allocationApproved && (
                              <select value="__unassigned" onChange={(e) => reassignAddress(key, e.target.value)} style={{ padding: '4px', fontSize: '12px' }}>
                                <option value="__unassigned">— unassigned —</option>
                                {Object.keys(drivers).filter(d => availableDrivers[d]).map(d => (<option key={d} value={d}>{d}</option>))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {Object.keys(proposedAllocation).filter(d => d !== '__unassigned' && (proposedAllocation[d] || []).filter(k => calculatedAddresses[k]).length > 0).length > 0 && (() => {
                    const rows = Object.keys(proposedAllocation).filter(d => d !== '__unassigned' && (proposedAllocation[d] || []).filter(k => calculatedAddresses[k]).length > 0).map((d) => {
                      const ordered = orderStops((proposedAllocation[d] || []).filter(k => calculatedAddresses[k]));
                      let total = 0;
                      for (let i = 0; i < ordered.length - 1; i++) {
                        const m = milesBetween(ordered[i], ordered[i + 1]);
                        if (m !== null) total += m;
                      }
                      return { d, stops: ordered.length, total };
                    });
                    const totalStops = rows.reduce((s, r) => s + r.stops, 0);
                    return (
                      <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ marginBottom: '6px' }}>Sense check before approving</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <tbody>
                            <tr style={{ background: '#f0f0f0' }}>
                              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #333' }}>Driver</th>
                              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #333' }}>Stops</th>
                              <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '2px solid #333' }}>Round dist.</th>
                            </tr>
                            {rows.map((r) => (
                              <tr key={r.d} style={{ borderBottom: '1px solid #e2e2e2' }}>
                                <td style={{ padding: '8px 6px' }}>{r.d}</td>
                                <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.stops}</td>
                                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.total.toFixed(1)} mi</td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
                              <td style={{ padding: '8px 6px' }}>Total</td>
                              <td style={{ padding: '8px 6px', textAlign: 'center' }}>{totalStops}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{rows.reduce((s, r) => s + r.total, 0).toFixed(1)} mi</td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Distances are approximate straight-line totals for each round, to help compare fairness.</p>
                      </div>
                    );
                  })()}

                  {!allocationApproved ? (
                    <button onClick={approveAllocation}
                      style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>
                      ✓ Approve Allocation
                    </button>
                  ) : (
                    <button onClick={unlockAllocation}
                      style={{ padding: '10px 20px', backgroundColor: '#FF9800', color: 'white', border: 'none', cursor: 'pointer' }}>
                      🔓 Unlock to Edit
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* SEND TAB */}
      {activeTab === 'send' && (
        <div>
          <h2>📤 Send to Drivers</h2>
          {!selectedDate ? (
            <p>Select a delivery date in the Poll tab first.</p>
          ) : !allocationApproved ? (
            <div style={{ backgroundColor: '#fff3e0', padding: '15px', borderRadius: '4px', border: '1px solid #ffcc80' }}>
              <p style={{ margin: 0 }}>⚠ No approved allocation yet. Go to the <strong>Allocate</strong> tab, run auto-allocation, review, and approve — then come back here to send.</p>
            </div>
          ) : (
            <>
              <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '4px', marginBottom: '15px' }}>
                <strong>Approved plan for {formatUKDate(selectedDate)}.</strong> Tap Share on each driver to send their list (image + route link) via WhatsApp.
              </div>
              <div style={{ border: '2px solid #1b5e20', borderRadius: '6px', padding: '12px', marginBottom: '18px', background: '#f1f8e9' }}>
                <strong>📋 All deliveries</strong>
                <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 10px 0' }}>Every driver's list with an overall totals header — for your own overview or the butcher. The <strong>PDF</strong> stays sharp on WhatsApp (sent as a document); the image is a quick photo share.</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={shareAllPdf} style={{ padding: '10px 18px', backgroundColor: '#1b5e20', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📄 Share PDF</button>
                  <button onClick={downloadAllPdf} style={{ padding: '10px 18px', backgroundColor: '#37474f', color: 'white', border: 'none', cursor: 'pointer' }}>⬇ Download PDF</button>
                  <button onClick={shareAllImage} style={{ padding: '10px 18px', backgroundColor: '#558b2f', color: 'white', border: 'none', cursor: 'pointer' }}>📲 Share image</button>
                  <button onClick={downloadAllImage} style={{ padding: '10px 18px', backgroundColor: '#607d8b', color: 'white', border: 'none', cursor: 'pointer' }}>⬇ Image</button>
                </div>
              </div>
              {Object.keys(allocations).filter(d => d !== '__unassigned' && allocations[d] && allocations[d].filter(k => calculatedAddresses[k]).length > 0).map((driver) => {
                // Only active stops this week — drop any address now on hold / excluded / with
                // nothing to deliver, so it never reaches the driver's list, image, or route.
                const keys = allocations[driver].filter(k => calculatedAddresses[k]);
                return (
                  <div key={driver} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '16px' }}>{driver}</strong>
                        {driverPhones[driver] && <span style={{ marginLeft: '10px', color: '#666', fontSize: '13px' }}>📞 {driverPhones[driver]}</span>}
                        <span style={{ marginLeft: '10px', color: '#666', fontSize: '13px' }}>{keys.length} stops</span>
                      </div>
                    </div>

                    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                      {orderStops(keys).map((key) => {
                        const a = addresses[key] || {};
                        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                        return (
                          <div key={key} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0', fontSize: '13px' }}>
                            <strong>{a.fullAddress || key}</strong>
                            <div style={{ color: '#444' }}>{c.chicken}🍗 {c.meat}🍖 {c.pies}🥧</div>
                            {a.notes && <div style={{ color: '#c62828', fontSize: '12px' }}>📝 {a.notes}</div>}
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={() => shareDriver(driver, keys)}
                        style={{ padding: '10px 18px', backgroundColor: '#25D366', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                        📲 Share to WhatsApp
                      </button>
                      <button onClick={() => downloadDriverImage(driver, keys)}
                        style={{ padding: '10px 18px', backgroundColor: '#607d8b', color: 'white', border: 'none', cursor: 'pointer' }}>
                        ⬇ Download image
                      </button>
                      <a href={buildRouteLink(keys)} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '10px 18px', backgroundColor: '#2196F3', color: 'white', textDecoration: 'none', display: 'inline-block' }}>
                        🗺️ Route
                      </a>
                      {driverPhones[driver] && (
                        <a href={`https://wa.me/${driverPhones[driver].replace(/\D/g,'').replace(/^0/, '44')}`} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '10px 18px', backgroundColor: '#128C7E', color: 'white', textDecoration: 'none', display: 'inline-block' }}>
                          💬 Open chat
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div>
          <h2>⚙️ Settings</h2>

          <h3>👤 Admin Users</h3>
          <div style={{ backgroundColor: '#e8f5e9', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '2px solid #66bb6a' }}>
            <p style={{ marginTop: 0, fontSize: '13px', color: '#555' }}>Invite another admin by email. They'll be emailed a link to set their own password, then they can log in with full access. Everyone added here has the same full access.</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="email" placeholder="new.admin@example.com" value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                style={{ padding: '8px', fontSize: '14px', flex: '1 1 240px', boxSizing: 'border-box' }} />
              <button onClick={inviteAdmin} disabled={userMgmtBusy}
                style={{ padding: '9px 16px', backgroundColor: userMgmtBusy ? '#9e9e9e' : '#2e7d32', color: 'white', border: 'none', cursor: userMgmtBusy ? 'default' : 'pointer', fontWeight: 'bold' }}>
                {userMgmtBusy ? 'Inviting…' : 'Invite admin'}
              </button>
            </div>
            {userMgmtMsg && <div style={{ marginTop: '10px', fontSize: '13px', color: userMgmtMsg.startsWith('✓') ? '#2e7d32' : '#c62828' }}>{userMgmtMsg}</div>}
            {adminUsersError && <div style={{ marginTop: '10px', fontSize: '13px', color: '#c62828', backgroundColor: '#fdecea', padding: '8px', borderRadius: '4px', border: '1px solid #f5c6cb' }}>⚠ {adminUsersError}</div>}
            <div style={{ marginTop: '14px' }}>
              <strong style={{ fontSize: '13px' }}>Admin users ({adminUsers.length}):</strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '6px' }}>
                <tbody>
                  {adminUsers.map((u) => {
                    const isMain = u.email === 'avner@radomsky.co.uk';
                    const seen = u.lastSeen ? new Date(u.lastSeen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
                    return (
                      <tr key={u.email} style={{ borderBottom: '1px solid #d7e8d7' }}>
                        <td style={{ padding: '6px 4px' }}>{u.email}{isMain ? <span style={{ color: '#888', fontSize: '11px' }}> (main)</span> : ''}</td>
                        <td style={{ padding: '6px 4px' }}>
                          {seen
                            ? <span style={{ color: '#2e7d32', fontWeight: 'bold', fontSize: '12px' }}>✓ Active <span style={{ color: '#888', fontWeight: 'normal' }}>· last login {seen}</span></span>
                            : <span style={{ color: '#e65100', fontWeight: 'bold', fontSize: '12px' }}>● Invited – not yet logged in</span>}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                          {!isMain && (
                            <button onClick={() => removeAdminFromList(u.email)}
                              style={{ padding: '4px 10px', backgroundColor: 'transparent', color: '#c62828', border: '1px solid #c62828', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '10px', marginBottom: 0 }}>This list shows admins invited through the app. To fully revoke access, delete the account in the Firebase console (Authentication → Users) as well — removing from this list alone doesn't disable their login.</p>
          </div>

          <h3>📊 Brought Forward Total</h3>
          <div style={{ backgroundColor: '#f3e5f5', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '2px solid #ba68c8' }}>
            <p style={{ marginTop: 0, fontSize: '13px', color: '#666' }}>Deliveries completed before you started using this system. This is added to the analytics totals.</p>
            <label style={{ fontWeight: 'bold' }}>Total deliveries brought forward: </label>
            <input type="number" min="0" value={broughtForwardTotal}
              onChange={(e) => setBroughtForwardTotal(parseInt(e.target.value) || 0)}
              style={{ padding: '8px', fontSize: '16px', fontWeight: 'bold', width: '120px', marginLeft: '8px' }} />
          </div>
          <h3>Anchor Date Configuration</h3>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
            <label>Anchor Date (First Delivery):</label>
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} style={{ padding: '8px', marginBottom: '10px' }} />
            <div style={{ marginBottom: '10px' }}>
              <label>Anchor Week Type:</label>
              <div>
                <label style={{ marginRight: '20px' }}><input type="radio" value="A" checked={anchorWeek === 'A'} onChange={(e) => setAnchorWeek(e.target.value)} /> Week A</label>
                <label><input type="radio" value="B" checked={anchorWeek === 'B'} onChange={(e) => setAnchorWeek(e.target.value)} /> Week B</label>
              </div>
            </div>
            <label><input type="checkbox" checked={anchorFirstOfMonth} onChange={(e) => setAnchorFirstOfMonth(e.target.checked)} /> First of Month (applies first-of-month bonus)</label>
            <div style={{ color: '#666', fontSize: '12px', marginTop: '10px' }}>
              <p>✅ Anchor date set: {anchorDate} (Week {anchorWeek})</p>
            </div>
          </div>

          <h3>Messages</h3>
          <label>Poll Message:</label>
          <textarea value={pollMessage} onChange={(e) => setPollMessage(e.target.value)}
            style={{ width: '100%', minHeight: '80px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
            placeholder="Hi! Are you available? Vote here: {LINK} Closes: {CUTOFF}" />
          <label>Delivery Message Header (sent to drivers):</label>
          <textarea value={deliveryMessage} onChange={(e) => setDeliveryMessage(e.target.value)}
            style={{ width: '100%', minHeight: '80px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
            placeholder="📦 DELIVERY LIST FOR {DRIVER} ..." />
          <p style={{ fontSize: '12px', color: '#666', marginTop: '-5px', marginBottom: '15px' }}>
            Use {'{DRIVER}'}, {'{DATE}'}, and {'{STOPS}'} as placeholders.
          </p>
          <label>Butcher Email Address:</label>
          <input type="email" value={butcherEmailAddress} onChange={(e) => setButcherEmailAddress(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '15px', boxSizing: 'border-box' }}
            placeholder="butcher@example.com" />

          <h3>📍 Collection Point</h3>
          <div style={{ backgroundColor: '#e8f5e9', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '2px solid #4CAF50' }}>
            <p style={{ marginTop: 0, fontSize: '13px', color: '#666' }}>The postcode where drivers collect (e.g. the butcher). Each driver's route will start from the delivery nearest to here, so they head out efficiently after collecting.</p>
            <label style={{ fontWeight: 'bold' }}>Collection postcode:</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
              <input type="text" value={collectionAddress} onChange={(e) => setCollectionAddress(e.target.value)}
                style={{ flex: 1, padding: '8px', boxSizing: 'border-box' }} placeholder="e.g. WD6 1AB" />
              <button onClick={locateCollectionPoint} disabled={geocoding}
                style={{ padding: '8px 14px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {geocoding ? 'Locating…' : '📍 Locate'}
              </button>
            </div>
            {(typeof collectionLat === 'number' && typeof collectionLng === 'number')
              ? <p style={{ fontSize: '12px', color: '#2e7d32', margin: '8px 0 0 0' }}>✓ Located ({collectionLat.toFixed(4)}, {collectionLng.toFixed(4)})</p>
              : <p style={{ fontSize: '12px', color: '#c62828', margin: '8px 0 0 0' }}>Not located yet — routes will start from an arbitrary stop until you locate this.</p>}
          </div>

          <label>Butcher Email Template:</label>
          <textarea value={butcherEmailTemplate} onChange={(e) => setButcherEmailTemplate(e.target.value)}
            style={{ width: '100%', minHeight: '120px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
            placeholder="Hi, please prepare ..." />
          <p style={{ fontSize: '12px', color: '#666', marginTop: '-5px', marginBottom: '15px' }}>
            Use {'{DATE}'}, {'{CHICKEN}'}, {'{MEAT}'}, and {'{PIES}'} as placeholders.
          </p>

          <h3 style={{ marginTop: '20px' }}>Poll Cutoff</h3>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
            <p style={{ marginTop: 0, fontSize: '13px', color: '#666' }}>When the availability poll closes each week.</p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label>Day:
                <select value={cutoffDay} onChange={(e) => setCutoffDay(e.target.value)} style={{ padding: '8px', marginLeft: '5px' }}>
                  <option value="monday">Monday</option><option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option><option value="thursday">Thursday</option>
                  <option value="friday">Friday</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option>
                </select>
              </label>
              <label>Time:
                <select value={cutoffHour} onChange={(e) => setCutoffHour(e.target.value)} style={{ padding: '8px', marginLeft: '5px' }}>
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (<option key={h} value={h}>{h}</option>))}
                </select>
                <span style={{ margin: '0 5px' }}>:</span>
                <select value={cutoffMinute} onChange={(e) => setCutoffMinute(e.target.value)} style={{ padding: '8px' }}>
                  {['00', '15', '30', '45'].map(m => (<option key={m} value={m}>{m}</option>))}
                </select>
              </label>
            </div>
          </div>

          <h3>Timezone</h3>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
            <label><input type="checkbox" checked={forceUKTime} onChange={(e) => setForceUKTime(e.target.checked)} /> Force UK time (keeps cutoff in UK time even when you're abroad)</label>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div>
          <h2>📊 Analytics & Backup</h2>
          <h3>Backup Your Data</h3>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
            <p style={{ marginTop: 0, fontSize: '13px', color: '#666' }}>
              Download all your data (addresses, drivers, settings, templates) as a file you can keep safe.
            </p>
            <button onClick={exportData} style={{ padding: '10px 20px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>
              📥 Download Backup
            </button>
          </div>
          <h3>Delivery Analytics</h3>
          {(() => {
            const dates = Object.keys(deliveryHistory).sort().reverse();
            // This period = sum of all recorded history
            let periodDeliveries = 0;
            const driverTotals = {}; // driver -> {deliveries, dates:Set}
            let totC = 0, totM = 0, totP = 0;
            dates.forEach((dt) => {
              const rec = deliveryHistory[dt];
              if (!rec) return;
              periodDeliveries += (rec.totals && rec.totals.deliveries) || 0;
              totC += (rec.totals && rec.totals.chicken) || 0;
              totM += (rec.totals && rec.totals.meat) || 0;
              totP += (rec.totals && rec.totals.pies) || 0;
              Object.keys(rec.perDriver || {}).forEach((d) => {
                if (!driverTotals[d]) driverTotals[d] = { deliveries: 0, dates: 0 };
                driverTotals[d].deliveries += rec.perDriver[d].deliveries || 0;
                driverTotals[d].dates += 1;
              });
            });
            const grandTotal = broughtForwardTotal + periodDeliveries;
            const driverNames = Object.keys(driverTotals).sort((a, b) => driverTotals[b].deliveries - driverTotals[a].deliveries);
            return (
              <div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <div style={{ flex: 1, minWidth: '130px', background: '#e3f2fd', border: '2px solid #1976d2', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{broughtForwardTotal}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Brought forward</div>
                  </div>
                  <div style={{ flex: 1, minWidth: '130px', background: '#e8f5e9', border: '2px solid #4CAF50', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{periodDeliveries}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>This period ({dates.length} rounds)</div>
                  </div>
                  <div style={{ flex: 1, minWidth: '130px', background: '#f3e5f5', border: '2px solid #9c27b0', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{grandTotal}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Total deliveries</div>
                  </div>
                  <div style={{ flex: 1, minWidth: '130px', background: '#fff3e0', border: '2px solid #ff9800', borderRadius: '6px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '26px', fontWeight: 'bold' }}>{driverNames.length}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Active drivers</div>
                  </div>
                </div>

                {dates.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#666' }}>No delivery rounds recorded yet. Approve an allocation in the Allocate tab and it will be recorded here.</p>
                ) : (
                  <>
                    <h4>Deliveries by Driver</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                      <tbody>
                        <tr style={{ background: '#f0f0f0' }}>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #333' }}>Driver</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>Rounds</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>Total deliveries</th>
                        </tr>
                        {driverNames.map((d) => (
                          <tr key={d} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '8px' }}>{d}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{driverTotals[d].dates}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{driverTotals[d].deliveries}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <h4>Order Totals Over Time</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '10px' }}>
                      <tbody>
                        <tr style={{ background: '#f0f0f0' }}>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #333' }}>Date</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>Deliveries</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>🍗</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>🍖</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>🥧</th>
                        </tr>
                        {dates.map((dt) => {
                          const rec = deliveryHistory[dt];
                          const t = (rec && rec.totals) || { deliveries: 0, chicken: 0, meat: 0, pies: 0 };
                          return (
                            <tr key={dt} style={{ borderBottom: '1px solid #ddd' }}>
                              <td style={{ padding: '8px' }}>{formatUKDate(dt)}{rec && rec.deliveryType && rec.deliveryType !== 'single' ? ` (${rec.deliveryType})` : ''}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{t.deliveries}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{t.chicken}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{t.meat}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{t.pies}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
                          <td style={{ padding: '8px' }}>Period total</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>{periodDeliveries}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>{totC}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>{totM}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>{totP}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{ marginTop: '20px', padding: '12px', background: '#fafafa', border: '1px solid #ddd', borderRadius: '4px' }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#666' }}>Clear the delivery history for a fresh period. Your "brought forward" number is kept — add this period's total to it first if you want a running grand total.</p>
                      <button onClick={() => {
                          if (window.confirm('Clear all recorded delivery rounds? The brought-forward number stays. This cannot be undone.')) {
                            setDeliveryHistory({});
                          }
                        }}
                        style={{ padding: '8px 16px', backgroundColor: '#fff', color: '#c62828', border: '1px solid #c62828', cursor: 'pointer', fontSize: '13px' }}>
                        🗑️ Clear History
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
