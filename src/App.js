import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
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
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // UI Navigation
  const [activeTab, setActiveTab] = useState('setup');
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
  const [pollMessage, setPollMessage] = useState('Hi! Quick question - are you available for delivery on {CUTOFF}? Vote here: {LINK}');
  const [emailTemplate, setEmailTemplate] = useState('');
  const [deliveryMessage, setDeliveryMessage] = useState('📦 DELIVERY LIST FOR {DRIVER}\n📅 Week of: {DATE}\n🚗 Total stops: {STOPS}');
  const [butcherEmailTemplate, setButcherEmailTemplate] = useState('Hi,\n\nPlease prepare the following for collection on {DATE}:\n\n🍗 Chicken: {CHICKEN}\n🍖 Meat: {MEAT}\n🥧 Pies: {PIES}\n\nThank you!');

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
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserData(currentUser.uid);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ============================================================================
  // FIREBASE DATA LOAD/SAVE
  // ============================================================================

  const loadUserData = (userId) => {
    if (!db) return;
    onValue(ref(db, `users/${userId}`), (snapshot) => {
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
      setLoading(false);
    });
  };

  const saveData = () => {
    if (!user || !db) return;
    set(ref(db, `users/${user.uid}`), {
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
      selectedDate: selectedDate || null,
      deliveryType
    });
  };

  useEffect(() => {
    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [addresses, drivers, driverPhones, driverPreferences, anchorDate, anchorWeek, anchorFirstOfMonth, pollMessage, deliveryMessage, butcherEmailTemplate, cutoffDay, cutoffHour, cutoffMinute, forceUKTime, pollResponses, allocations, autoAllocated, proposedAllocation, allocationApproved, availableDrivers, weekOverrides, selectedDate, deliveryType, user]);

  // ============================================================================
  // DATE HELPERS (pure, usable from load before state is set)
  // ============================================================================

  const formatUKDate = (dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
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
    const emailContent = butcherEmailTemplate
      .replace(/{DATE}/g, formatUKDate(selectedDate))
      .replace(/{CHICKEN}/g, totalChicken)
      .replace(/{MEAT}/g, totalMeat)
      .replace(/{PIES}/g, totalPies);
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
      .replace(/{DRIVER}/g, driverName)
      .replace(/{DATE}/g, formatUKDate(dateStr))
      .replace(/{STOPS}/g, addresses_array.length);
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

    const hasManual = (lat !== '' && lat != null && !isNaN(parseFloat(lat)) && lng !== '' && lng != null && !isNaN(parseFloat(lng)));

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
    // If editing and the address text changed, remove the old key
    if (editingAddress.originalKey && editingAddress.originalKey !== key) {
      delete newAddresses[editingAddress.originalKey];
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
    set(ref(db, `polls/${pollId}`), {
      date: selectedDate,
      createdAt: new Date().toISOString(),
      roster,
      votes: {}
    }).then(() => {
      setActivePollId(pollId);
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
      cutoffDay, cutoffHour, cutoffMinute, forceUKTime,
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
  useEffect(() => {
    if (!db || !activePollId) return;
    const votesRef = ref(db, `polls/${activePollId}/votes`);
    const unsub = onValue(votesRef, (snap) => {
      const v = snap.val() || {};
      setPollVotes(v);
      // Auto-apply each vote to the availability list so the boxes tick themselves.
      setAvailableDrivers((prev) => {
        const next = { ...prev };
        Object.values(v).forEach((vote) => {
          if (vote && vote.name) {
            next[vote.name] = !!vote.available;
          }
        });
        return next;
      });
    });
    return () => unsub();
  }, [activePollId]);

  // Seed availability from votes (available === true). Manual overrides preserved.
  const seedAvailabilityFromVotes = () => {
    const seed = {};
    Object.keys(drivers).forEach((name) => { seed[name] = false; });
    Object.values(pollVotes).forEach((vote) => {
      if (vote && vote.name && vote.available) seed[vote.name] = true;
    });
    setAvailableDrivers(seed);
  };

  const toggleDriverAvailable = (name) => {
    setAvailableDrivers(prev => ({ ...prev, [name]: !prev[name] }));
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

    // FINAL REBALANCE: even out counts to spread <= 1 without breaking avoid/preferred.
    // Preferred-locked addresses must stay; we only move non-preferred ones.
    const isLocked = (key) => {
      const a = addrInfo(key);
      return a.preferredDriver && avail.includes(a.preferredDriver);
    };
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
      // candidate movable addresses on maxD: not preferred-locked, not avoiding minD
      let bestKey=null, bestDist=Infinity;
      result[maxD].forEach(key => {
        if (isLocked(key)) return;
        if (((addrInfo(key).avoidDrivers)||[]).includes(minD)) return;
        const a = addrInfo(key);
        const dd = (minC && typeof a.lat==='number') ? dist2(a, minC) : 0;
        if (dd < bestDist) { bestDist = dd; bestKey = key; }
      });
      if (!bestKey) {
        // maxD has nothing movable to minD; try any over-loaded driver -> minD
        let moved = false;
        const overs = avail.slice().sort((a,b)=>result[b].length-result[a].length);
        for (const od of overs) {
          if (result[od].length - result[minD].length <= 1) break;
          const cand = result[od].find(key => !isLocked(key) && !((addrInfo(key).avoidDrivers)||[]).includes(minD));
          if (cand) { result[od]=result[od].filter(x=>x!==cand); result[minD].push(cand); moved=true; break; }
        }
        if (!moved) break;
        continue;
      }
      result[maxD] = result[maxD].filter(x=>x!==bestKey);
      result[minD].push(bestKey);
    }

    if (unassigned.length > 0) result.__unassigned = unassigned;
    setProposedAllocation(result);
    setAllocationApproved(false);
    
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

  const approveAllocation = () => {
    const hasUnassigned = proposedAllocation.__unassigned && proposedAllocation.__unassigned.length > 0;
    if (hasUnassigned) {
      if (!window.confirm('Some addresses are unassigned. Approve anyway?')) return;
    }
    setAllocations(proposedAllocation);
    setAllocationApproved(true);
  };

  const unlockAllocation = () => {
    setAllocationApproved(false);
  };

  // ============================================================================
  // PER-DRIVER SEND (image via Web Share, route link)
  // ============================================================================

  const buildRouteLink = (keys) => {
    // Use coordinates if available, else the postal address text, as Google Maps waypoints.
    const parts = keys.map((key) => {
      const a = addresses[key] || {};
      if (typeof a.lat === 'number' && typeof a.lng === 'number') {
        return `${a.lat},${a.lng}`;
      }
      return encodeURIComponent(a.fullAddress || key);
    });
    if (parts.length === 0) return '';
    return 'https://www.google.com/maps/dir/' + parts.join('/');
  };

  const buildDriverCaption = (driverName, keys) => {
    const header = deliveryMessage
      .replace(/{DRIVER}/g, driverName)
      .replace(/{DATE}/g, formatUKDate(selectedDate))
      .replace(/{STOPS}/g, keys.length);
    const route = buildRouteLink(keys);
    return header + (route ? `\n\n🗺️ Route: ${route}` : '');
  };

  // Build well-formed XHTML for the driver's delivery table (for rasterising to PNG)
  const buildDriverXHTML = (driverName, keys) => {
    const width = 600;
    const rowsHTML = keys.map((key) => {
      const a = addresses[key] || {};
      const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
      const notes = a.notes ? `<div style="font-size:11px;color:#666;margin-top:2px;">${escapeXML(a.notes)}</div>` : '';
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
  const rasteriseToPng = (driverName, keys) => new Promise((resolve, reject) => {
    try {
      const scale = 2; // retina-quality
      const width = 620;
      const headerH = 96;
      const rowH = 64;
      const footerH = 30;
      const height = headerH + keys.length * rowH + footerH;

      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // background
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

      // header separator
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, headerH - 6);
      ctx.lineTo(width - 16, headerH - 6);
      ctx.stroke();

      // helper to truncate long text to fit a width
      const fit = (text, maxW) => {
        text = String(text || '');
        if (ctx.measureText(text).width <= maxW) return text;
        while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        return text + '…';
      };

      let y = headerH + 8;
      keys.forEach((key, idx) => {
        const a = addresses[key] || {};
        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };

        // alternating row background
        if (idx % 2 === 1) {
          ctx.fillStyle = '#f6f6f6';
          ctx.fillRect(8, y - 6, width - 16, rowH);
        }

        // address (left, bold)
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText(fit(a.fullAddress || key, width - 150), 16, y);

        // quantities (right-aligned label)
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillStyle = '#333333';
        const qty = 'Chk ' + c.chicken + '   Mt ' + c.meat + '   Pie ' + c.pies;
        ctx.fillText(qty, 16, y + 20);

        // notes (italic, grey) if present
        if (a.notes) {
          ctx.font = 'italic 12px Arial, sans-serif';
          ctx.fillStyle = '#777777';
          ctx.fillText(fit('Note: ' + a.notes, width - 32), 16, y + 40);
        }

        // row separator
        ctx.strokeStyle = '#e2e2e2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, y + rowH - 10);
        ctx.lineTo(width - 16, y + rowH - 10);
        ctx.stroke();

        y += rowH;
      });

      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error('Could not create image'));
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });

  const shareDriver = async (driverName, keys) => {
    const caption = buildDriverCaption(driverName, keys);
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
        <h1>🍽️ Charity Delivery Coordinator</h1>
        <p>Admin Access Only</p>
        {authError && <div style={{ color: 'red', marginBottom: '10px' }}>{authError}</div>}
        <input type="email" placeholder="Email" value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
        <input type="password" placeholder="Password" value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} />
        <button
          onClick={() => {
            signInWithEmailAndPassword(auth, loginEmail, loginPassword)
              .catch((error) => setAuthError(error.message));
          }}
          style={{ width: '100%', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>
          Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🍽️ Charity Delivery Coordinator</h1>
        <button onClick={() => signOut(auth)}
          style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd', flexWrap: 'wrap' }}>
        {['setup', 'poll', 'summary', 'allocate', 'send', 'analytics', 'settings'].map((tab) => (
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

      {/* SETUP TAB */}
      {activeTab === 'setup' && (
        <div>
          <h2>📋 Setup</h2>
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
            {Object.keys(addresses).map((key) => {
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
                  {a.notes && <p style={{ margin: '5px 0', fontSize: '11px', color: '#666' }}>📝 {a.notes}</p>}
                  {a.preferredDriver && <p style={{ margin: '3px 0', fontSize: '11px', color: '#2e7d32' }}>⭐ Preferred: {a.preferredDriver}</p>}
                  {a.avoidDrivers && a.avoidDrivers.length > 0 && <p style={{ margin: '3px 0', fontSize: '11px', color: '#c62828' }}>🚫 Avoid: {a.avoidDrivers.join(', ')}</p>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => startEditAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>Edit</button>
                    {a.needsLocation && <button onClick={() => locateAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#FF9800', color: 'white', border: 'none', cursor: 'pointer' }}>Locate</button>}
                    <button onClick={() => deleteAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 style={{ marginTop: '30px' }}>Drivers</h3>
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
                <button onClick={openPollForVoting}
                  style={{ padding: '10px 20px', backgroundColor: '#FF9800', color: 'white', border: 'none', cursor: 'pointer' }}>
                  📣 Open Poll for Voting
                </button>
                {activePollId && (
                  <div style={{ marginTop: '15px' }}>
                    <p style={{ margin: '5px 0', fontSize: '13px' }}><strong>Poll is live!</strong> Share this link with your drivers:</p>
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
              <h3>Addresses</h3>
              <p style={{ fontSize: '13px', color: '#666' }}>You can override quantities or exclude an address for this week only. Overrides apply to this date and feed both the butcher order and driver lists. They don't change the standing pattern.</p>
              <div style={{ marginBottom: '20px' }}>
                {Object.keys(addresses).filter(key => !isOnHold(addresses[key], selectedDate)).map((key) => {
                  const dateOv = (weekOverrides && weekOverrides[selectedDate] && weekOverrides[selectedDate][key]) || {};
                  const calc = calculatedAddresses[key];
                  const excluded = !!dateOv.excluded;
                  const total = calc ? (calc.chicken + calc.meat + calc.pies) : 0;
                  const zeroThisWeek = !excluded && total === 0;
                  return (
                    <div key={key} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', backgroundColor: excluded ? '#fafafa' : (zeroThisWeek ? '#f7f7f7' : (calc && calc.overridden ? '#fffde7' : 'white')), opacity: zeroThisWeek ? 0.75 : 1 }}>
                      <strong style={{ textDecoration: excluded ? 'line-through' : 'none' }}>{addresses[key].fullAddress}</strong>
                      {calc && calc.overridden && !excluded && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#f57f17', fontWeight: 'bold' }}>✎ overridden this week</span>}
                      {excluded && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#999', fontWeight: 'bold' }}>excluded this week</span>}
                      {zeroThisWeek && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#999' }}>no items this week (you can add a one-off below)</span>}
                      {!excluded && (
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
                      {addresses[key].notes && <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#666' }}>📝 {addresses[key].notes}</p>}
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

              {/* Availability */}
              <h3>1. Driver Availability</h3>
              <p style={{ fontSize: '13px', color: '#666' }}>
                {activePollId ? 'Live from the poll. Tick or untick to override.' : 'No active poll — tick who is available this week.'}
              </p>
              {activePollId && (
                <button onClick={seedAvailabilityFromVotes}
                  style={{ padding: '8px 16px', marginBottom: '10px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>
                  ↺ Load poll results
                </button>
              )}
              <div style={{ marginBottom: '20px' }}>
                {Object.keys(drivers).length === 0 && <p style={{ color: '#999' }}>Add drivers first.</p>}
                {Object.keys(drivers).map((name) => {
                  // find this driver's vote
                  let voted = null;
                  Object.values(pollVotes).forEach(v => { if (v && v.name === name) voted = v.available; });
                  return (
                    <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                      <input type="checkbox" checked={!!availableDrivers[name]} onChange={() => toggleDriverAvailable(name)} />
                      <strong>{name}</strong>
                      {voted === true && <span style={{ fontSize: '12px', color: 'green' }}>✓ voted available</span>}
                      {voted === false && <span style={{ fontSize: '12px', color: '#c62828' }}>✗ voted not available</span>}
                      {voted === null && <span style={{ fontSize: '12px', color: '#999' }}>no vote</span>}
                    </label>
                  );
                })}
              </div>

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
                  <p style={{ fontSize: '13px', color: '#666' }}>
                    {allocationApproved ? 'This plan is approved and locked. Unlock to make changes.' : 'Move any address to a different driver, then approve.'}
                  </p>
                  {Object.keys(proposedAllocation).filter(d => d !== '__unassigned').map((driver) => (
                    <div key={driver} style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '12px', marginBottom: '12px' }}>
                      <strong>{driver}</strong> <span style={{ color: '#666', fontSize: '13px' }}>({proposedAllocation[driver].length} stops)</span>
                      {proposedAllocation[driver].length === 0 && <p style={{ fontSize: '12px', color: '#999', margin: '6px 0 0 0' }}>No stops</p>}
                      {proposedAllocation[driver].map((key) => {
                        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                        return (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', fontSize: '13px', borderTop: '1px solid #f0f0f0', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                              <div><strong>{addresses[key] ? addresses[key].fullAddress : key}</strong></div>
                              <div style={{ color: '#444', marginTop: '2px' }}>{c.chicken}🍗 {c.meat}🍖 {c.pies}🥧</div>
                              {addresses[key] && addresses[key].notes && <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>📝 {addresses[key].notes}</div>}
                            </div>
                            {!allocationApproved && (
                              <select value={driver} onChange={(e) => reassignAddress(key, e.target.value)} style={{ padding: '4px', fontSize: '12px' }}>
                                {Object.keys(drivers).filter(d => availableDrivers[d]).map(d => (<option key={d} value={d}>{d}</option>))}
                                <option value="__unassigned">— unassign —</option>
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {proposedAllocation.__unassigned && proposedAllocation.__unassigned.length > 0 && (
                    <div style={{ border: '1px solid #f44336', borderRadius: '4px', padding: '12px', marginBottom: '12px', backgroundColor: '#ffebee' }}>
                      <strong style={{ color: '#c62828' }}>⚠ Unassigned ({proposedAllocation.__unassigned.length})</strong>
                      {proposedAllocation.__unassigned.map((key) => {
                        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                        return (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', fontSize: '13px', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                              <div><strong>{addresses[key] ? addresses[key].fullAddress : key}</strong></div>
                              <div style={{ color: '#444', marginTop: '2px' }}>{c.chicken}🍗 {c.meat}🍖 {c.pies}🥧</div>
                              {addresses[key] && addresses[key].notes && <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>📝 {addresses[key].notes}</div>}
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
              {Object.keys(allocations).filter(d => d !== '__unassigned' && allocations[d] && allocations[d].length > 0).map((driver) => {
                const keys = allocations[driver];
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
                      {keys.map((key) => {
                        const a = addresses[key] || {};
                        const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                        return (
                          <div key={key} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0', fontSize: '13px' }}>
                            <strong>{a.fullAddress || key}</strong>
                            <div style={{ color: '#444' }}>{c.chicken}🍗 {c.meat}🍖 {c.pies}🥧</div>
                            {a.notes && <div style={{ color: '#888', fontSize: '12px' }}>📝 {a.notes}</div>}
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
          {!allocationApproved ? (
            <p style={{ fontSize: '13px', color: '#666' }}>Approve an allocation (in the Allocate tab) to see delivery stats here.</p>
          ) : (
            <div>
              <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '4px', marginBottom: '15px' }}>
                <strong>Approved plan for {formatUKDate(selectedDate)}</strong>
              </div>
              {(() => {
                const driverList = Object.keys(allocations).filter(d => d !== '__unassigned');
                let totC = 0, totM = 0, totP = 0, totStops = 0;
                driverList.forEach(d => {
                  (allocations[d] || []).forEach(key => {
                    const c = calculatedAddresses[key] || { chicken: 0, meat: 0, pies: 0 };
                    totC += c.chicken; totM += c.meat; totP += c.pies; totStops += 1;
                  });
                });
                return (
                  <>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '15px' }}>
                      <div style={{ background: '#f5f5f5', padding: '12px 18px', borderRadius: '4px' }}><strong>{driverList.length}</strong><br/>drivers</div>
                      <div style={{ background: '#f5f5f5', padding: '12px 18px', borderRadius: '4px' }}><strong>{totStops}</strong><br/>stops</div>
                      <div style={{ background: '#f5f5f5', padding: '12px 18px', borderRadius: '4px' }}><strong>{totC}</strong> 🍗<br/>chicken</div>
                      <div style={{ background: '#f5f5f5', padding: '12px 18px', borderRadius: '4px' }}><strong>{totM}</strong> 🍖<br/>meat</div>
                      <div style={{ background: '#f5f5f5', padding: '12px 18px', borderRadius: '4px' }}><strong>{totP}</strong> 🥧<br/>pies</div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <tbody>
                        <tr style={{ background: '#f0f0f0' }}>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #333' }}>Driver</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>Stops</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>🍗</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>🍖</th>
                          <th style={{ padding: '8px', borderBottom: '2px solid #333' }}>🥧</th>
                        </tr>
                        {driverList.map(d => {
                          let c=0,m=0,p=0;
                          (allocations[d] || []).forEach(key => {
                            const q = calculatedAddresses[key] || { chicken:0,meat:0,pies:0 };
                            c+=q.chicken; m+=q.meat; p+=q.pies;
                          });
                          return (
                            <tr key={d} style={{ borderBottom: '1px solid #ddd' }}>
                              <td style={{ padding: '8px' }}>{d}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{(allocations[d]||[]).length}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{c}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{m}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{p}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
