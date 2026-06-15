import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, set, onValue } from 'firebase/database';

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
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CharityDeliverySystem() {
  // ============================================================================
  // STATE VARIABLES
  // ============================================================================

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
  const [editingAddress, setEditingAddress] = useState(null);
  const [editingAddressForPreferences, setEditingAddressForPreferences] = useState(null);

  // Addresses with complete data structure
  const [addresses, setAddresses] = useState({});
  // Structure: { "5 Market Street": { fullAddress, postcode, weekA: {chicken, meat, pies}, weekB: {chicken, meat, pies}, firstOfMonth: {chicken, meat, pies}, name, adults, children, notes } }

  // Anchor Date System
  const [anchorDate, setAnchorDate] = useState('2024-06-06');
  const [anchorWeek, setAnchorWeek] = useState('A');
  const [anchorFirstOfMonth, setAnchorFirstOfMonth] = useState(true);

  // Selected Delivery Date & Type
  const [selectedDate, setSelectedDate] = useState(null);
  const [detectedWeekType, setDetectedWeekType] = useState(null);
  const [detectedFirstOfMonth, setDetectedFirstOfMonth] = useState(false);
  const [deliveryType, setDeliveryType] = useState('single'); // 'single', 'double', 'triple'

  // Calculated totals
  const [calculatedAddresses, setCalculatedAddresses] = useState({});
  // Structure: { "5 Market Street": { chicken: 2, meat: 1, pies: 0, notes: "Door code: 1234..." } }

  // Drivers
  const [drivers, setDrivers] = useState({});
  const [driverPhones, setDriverPhones] = useState({});
  const [driverPreferences, setDriverPreferences] = useState({});

  // Poll system
  const [pollMode, setPollMode] = useState(false);
  const [pollResponses, setPollResponses] = useState({});
  const [allocations, setAllocations] = useState({});
  const [autoAllocated, setAutoAllocated] = useState(false);

  // Message customization
  const [pollMessage, setPollMessage] = useState('Hi! Quick question - are you available for delivery on {CUTOFF}? Vote here: {LINK}');
  const [emailTemplate, setEmailTemplate] = useState('');

  // UI feedback
  const [copiedMessage, setCopiedMessage] = useState('');

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
        setPollMessage(data.pollMessage || pollMessage);
        setPollResponses(data.pollResponses || {});
        setAllocations(data.allocations || {});
        setAutoAllocated(data.autoAllocated || false);
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
      pollResponses,
      allocations,
      autoAllocated
    });
  };

  useEffect(() => {
    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [addresses, drivers, driverPhones, driverPreferences, anchorDate, anchorWeek, anchorFirstOfMonth, pollMessage, pollResponses, allocations, autoAllocated, user]);

  // ============================================================================
  // ANCHOR DATE & WEEK DETECTION SYSTEM
  // ============================================================================

  const detectWeekType = (date) => {
    if (!anchorDate) return 'A';
    
    const anchor = new Date(anchorDate);
    const selected = new Date(date);
    
    const daysDiff = Math.floor((selected - anchor) / (1000 * 60 * 60 * 24));
    const cyclePosition = Math.floor(daysDiff / 14);
    
    // If cycle position is even, return Week A; if odd, return Week B
    if (anchorWeek === 'A') {
      return (cyclePosition % 2 === 0) ? 'A' : 'B';
    } else {
      return (cyclePosition % 2 === 0) ? 'B' : 'A';
    }
  };

  const isFirstOfMonth = (date) => {
    const d = new Date(date);
    return d.getDate() <= 8; // Days 1-8 of month
  };

  const handleDateSelection = (dateString) => {
    setSelectedDate(dateString);
    const detected = detectWeekType(dateString);
    const isFirstMonth = isFirstOfMonth(dateString);
    
    setDetectedWeekType(detected);
    setDetectedFirstOfMonth(isFirstMonth && anchorFirstOfMonth);
    setDeliveryType('single'); // Reset to single by default
  };

  // ============================================================================
  // RULE COMBINING - SINGLE/DOUBLE/TRIPLE
  // ============================================================================

  const combineRules = (address, weekType, deliveryTypeSelected, isFirstMonth) => {
    if (!address) return { chicken: 0, meat: 0, pies: 0 };

    let result = { chicken: 0, meat: 0, pies: 0 };

    const addQuantities = (current, toAdd) => ({
      chicken: current.chicken + toAdd.chicken,
      meat: current.meat + toAdd.meat,
      pies: current.pies + toAdd.pies
    });

    if (deliveryTypeSelected === 'single') {
      result = weekType === 'A' ? { ...address.weekA } : { ...address.weekB };
      
      if (isFirstMonth) {
        result = addQuantities(result, address.firstOfMonth || { chicken: 0, meat: 0, pies: 0 });
      }
    } else if (deliveryTypeSelected === 'double') {
      if (weekType === 'A') {
        result = addQuantities(address.weekA, address.weekB);
      } else {
        result = addQuantities(address.weekB, address.weekA);
      }
      
      if (isFirstMonth) {
        result = addQuantities(result, address.firstOfMonth || { chicken: 0, meat: 0, pies: 0 });
      }
    } else if (deliveryTypeSelected === 'triple') {
      if (weekType === 'A') {
        result = addQuantities(addQuantities(address.weekA, address.weekB), address.weekA);
      } else {
        result = addQuantities(addQuantities(address.weekB, address.weekA), address.weekB);
      }
      
      if (isFirstMonth) {
        result = addQuantities(result, address.firstOfMonth || { chicken: 0, meat: 0, pies: 0 });
      }
    }

    return result;
  };

  // ============================================================================
  // CALCULATE ALL ADDRESSES
  // ============================================================================

  const calculateAllAddresses = () => {
    if (!selectedDate || !detectedWeekType) return;

    const calculated = {};
    let totalChicken = 0, totalMeat = 0, totalPies = 0;

    Object.keys(addresses).forEach((key) => {
      const address = addresses[key];
      const quantities = combineRules(address, detectedWeekType, deliveryType, detectedFirstOfMonth);
      
      calculated[key] = {
        ...quantities,
        notes: address.notes || '',
        fullAddress: address.fullAddress,
        postcode: address.postcode
      };

      totalChicken += quantities.chicken;
      totalMeat += quantities.meat;
      totalPies += quantities.pies;
    });

    setCalculatedAddresses(calculated);

    // Generate butcher email
    const emailContent = `
DELIVERY FOR ${selectedDate}

Week: ${detectedWeekType}${detectedFirstOfMonth ? ' + First of Month' : ''}
Type: ${deliveryType.charAt(0).toUpperCase() + deliveryType.slice(1)}

TOTALS:
Chicken: ${totalChicken}
Meat: ${totalMeat}
Pies: ${totalPies}

DETAILS:
${Object.keys(calculated).map(key => `${calculated[key].fullAddress}: Chicken ${calculated[key].chicken}, Meat ${calculated[key].meat}, Pies ${calculated[key].pies}`).join('\n')}
    `;

    setEmailTemplate(emailContent);
  };

  useEffect(() => {
    calculateAllAddresses();
  }, [selectedDate, deliveryType, detectedWeekType, addresses]);

  // ============================================================================
  // HTML TABLE GENERATION WITH NOTES
  // ============================================================================

  const generateHTMLTable = () => {
    const driverName = "DRIVER_NAME"; // Will be replaced when sent to specific driver
    const dateStr = selectedDate || new Date().toISOString().split('T')[0];
    const weekLabel = detectedWeekType + (detectedFirstOfMonth ? ' + First of Month' : '');
    const addresses_array = Object.entries(calculatedAddresses);

    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; background: white; max-width: 600px;">
  <h2 style="color: #333; margin-bottom: 5px;">📦 DELIVERY LIST FOR ${driverName}</h2>
  <p style="margin: 5px 0; color: #666;">📅 Week of: ${dateStr}</p>
  <p style="margin: 5px 0; color: #666;">🚗 Total stops: ${addresses_array.length}</p>
  
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
      <td style="padding: 10px; border-right: 1px solid #ddd;">
        <strong style="color: #333;">${addr.fullAddress}</strong>
      </td>
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
  // ADDRESS MANAGEMENT
  // ============================================================================

  const addOrUpdateAddress = () => {
    if (!editingAddress?.fullAddress || !editingAddress?.postcode) {
      alert('Please fill in address and postcode');
      return;
    }

    const key = editingAddress.fullAddress;
    
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
      name: editingAddress.name,
      adults: parseInt(editingAddress.adults) || 0,
      children: parseInt(editingAddress.children) || 0,
      notes: editingAddress.notes
    };

    setAddresses({
      ...addresses,
      [key]: newAddress
    });

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

  // ============================================================================
  // UI COMPONENTS
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
        
        <input
          type="email"
          placeholder="Email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }}
        />
        
        <input
          type="password"
          placeholder="Password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }}
        />
        
        <button
          onClick={() => {
            signInWithEmailAndPassword(auth, loginEmail, loginPassword)
              .catch((error) => setAuthError(error.message));
          }}
          style={{ width: '100%', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Login
        </button>
      </div>
    );
  }

  // ============================================================================
  // MAIN UI - TABS
  // ============================================================================

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🍽️ Charity Delivery Coordinator</h1>
        <button
          onClick={() => signOut(auth)}
          style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Logout
        </button>
      </div>

      {/* TAB NAVIGATION */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd' }}>
        {['setup', 'poll', 'summary', 'send', 'analytics', 'settings'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === tab ? '#4CAF50' : '#f0f0f0',
              color: activeTab === tab ? 'white' : 'black',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 'bold' : 'normal'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* SETUP TAB */}
      {activeTab === 'setup' && (
        <div>
          <h2>📋 Setup</h2>
          
          <h3>Addresses</h3>
          <button onClick={() => setShowAddAddress(true)} style={{ padding: '8px 16px', marginBottom: '10px' }}>
            ➕ Add Address
          </button>

          {showAddAddress && (
            <div style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '15px' }}>
              <h4>Add/Edit Address</h4>
              
              <input
                type="text"
                placeholder="Full Address"
                value={editingAddress?.fullAddress || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, fullAddress: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              <input
                type="text"
                placeholder="Postcode"
                value={editingAddress?.postcode || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, postcode: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label>Week A Chicken</label>
                  <input
                    type="number"
                    value={editingAddress?.weekAChicken || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, weekAChicken: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label>Week A Meat</label>
                  <input
                    type="number"
                    value={editingAddress?.weekAMeat || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, weekAMeat: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label>Week A Pies</label>
                  <input
                    type="number"
                    value={editingAddress?.weekAPies || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, weekAPies: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label>Week B Chicken</label>
                  <input
                    type="number"
                    value={editingAddress?.weekBChicken || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, weekBChicken: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label>Week B Meat</label>
                  <input
                    type="number"
                    value={editingAddress?.weekBMeat || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, weekBMeat: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label>Week B Pies</label>
                  <input
                    type="number"
                    value={editingAddress?.weekBPies || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, weekBPies: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label>First of Month Chicken</label>
                  <input
                    type="number"
                    value={editingAddress?.firstOfMonthChicken || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, firstOfMonthChicken: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label>First of Month Meat</label>
                  <input
                    type="number"
                    value={editingAddress?.firstOfMonthMeat || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, firstOfMonthMeat: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label>First of Month Pies</label>
                  <input
                    type="number"
                    value={editingAddress?.firstOfMonthPies || 0}
                    onChange={(e) => setEditingAddress({ ...editingAddress, firstOfMonthPies: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Name (admin only)"
                value={editingAddress?.name || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, name: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="number"
                  placeholder="Adults"
                  value={editingAddress?.adults || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, adults: e.target.value })}
                  style={{ padding: '8px', boxSizing: 'border-box' }}
                />
                <input
                  type="number"
                  placeholder="Children"
                  value={editingAddress?.children || 0}
                  onChange={(e) => setEditingAddress({ ...editingAddress, children: e.target.value })}
                  style={{ padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <textarea
                placeholder="Notes (door codes, access info - shown to drivers)"
                value={editingAddress?.notes || ''}
                onChange={(e) => setEditingAddress({ ...editingAddress, notes: e.target.value })}
                style={{ width: '100%', padding: '8px', minHeight: '60px', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={addOrUpdateAddress} style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>
                  Save Address
                </button>
                <button onClick={() => setShowAddAddress(false)} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '15px' }}>
            {Object.keys(addresses).map((key) => (
              <div key={key} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px' }}>
                <strong>{addresses[key].fullAddress}</strong>
                <p style={{ margin: '5px 0', fontSize: '12px' }}>
                  W.A: {addresses[key].weekA.chicken} chicken, {addresses[key].weekA.meat} meat | 
                  W.B: {addresses[key].weekB.chicken} chicken, {addresses[key].weekB.meat} meat
                </p>
                {addresses[key].notes && <p style={{ margin: '5px 0', fontSize: '11px', color: '#666' }}>📝 {addresses[key].notes}</p>}
                <div>
                  <button onClick={() => deleteAddress(key)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}>
                    Delete
                  </button>
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
            <input
              type="date"
              value={selectedDate || ''}
              onChange={(e) => handleDateSelection(e.target.value)}
              style={{ padding: '8px', fontSize: '16px' }}
            />
          </div>

          {selectedDate && (
            <>
              <div style={{ backgroundColor: '#e8f5e9', padding: '15px', marginBottom: '20px', borderRadius: '4px' }}>
                <strong>Week Detected:</strong> {detectedWeekType}{detectedFirstOfMonth ? ' + First of Month' : ''}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label>Delivery Type:</label>
                <div>
                  <label style={{ marginRight: '20px' }}>
                    <input
                      type="radio"
                      value="single"
                      checked={deliveryType === 'single'}
                      onChange={(e) => setDeliveryType(e.target.value)}
                    />
                    Single
                  </label>
                  <label style={{ marginRight: '20px' }}>
                    <input
                      type="radio"
                      value="double"
                      checked={deliveryType === 'double'}
                      onChange={(e) => setDeliveryType(e.target.value)}
                    />
                    Double
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="triple"
                      checked={deliveryType === 'triple'}
                      onChange={(e) => setDeliveryType(e.target.value)}
                    />
                    Triple
                  </label>
                </div>
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
                <strong>Delivery Date:</strong> {selectedDate}<br />
                <strong>Week:</strong> {detectedWeekType}{detectedFirstOfMonth ? ' + First of Month' : ''}<br />
                <strong>Type:</strong> {deliveryType.charAt(0).toUpperCase() + deliveryType.slice(1)}
              </div>

              <h3>Addresses</h3>
              <div style={{ marginBottom: '20px' }}>
                {Object.keys(calculatedAddresses).map((key) => (
                  <div key={key} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px' }}>
                    <strong>{calculatedAddresses[key].fullAddress}</strong>
                    <p style={{ margin: '5px 0' }}>Chicken: {calculatedAddresses[key].chicken}, Meat: {calculatedAddresses[key].meat}, Pies: {calculatedAddresses[key].pies}</p>
                    {calculatedAddresses[key].notes && <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>📝 {calculatedAddresses[key].notes}</p>}
                  </div>
                ))}
              </div>

              <h3>Butcher Email</h3>
              <textarea
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                style={{ width: '100%', minHeight: '200px', padding: '10px', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(emailTemplate);
                  setCopiedMessage('Copied!');
                  setTimeout(() => setCopiedMessage(''), 2000);
                }}
                style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                Copy Email
              </button>
              {copiedMessage && <span style={{ marginLeft: '10px', color: 'green' }}>{copiedMessage}</span>}
            </>
          ) : (
            <p>Select a delivery date in the Poll tab first.</p>
          )}
        </div>
      )}

      {/* SEND TAB */}
      {activeTab === 'send' && (
        <div>
          <h2>📤 Send Delivery Messages</h2>

          {selectedDate ? (
            <>
              <h3>WhatsApp Message Preview</h3>
              <div
                dangerouslySetInnerHTML={{ __html: generateHTMLTable() }}
                style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '20px', backgroundColor: '#f9f9f9' }}
              />

              <button
                onClick={() => {
                  const html = generateHTMLTable();
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'delivery-list.html';
                  a.click();
                }}
                style={{ padding: '10px 20px', backgroundColor: '#25D366', color: 'white', border: 'none', cursor: 'pointer', marginRight: '10px' }}
              >
                Download Image
              </button>
            </>
          ) : (
            <p>Select a delivery date in the Poll tab first.</p>
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
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              style={{ padding: '8px', marginBottom: '10px' }}
            />

            <div style={{ marginBottom: '10px' }}>
              <label>Anchor Week Type:</label>
              <div>
                <label style={{ marginRight: '20px' }}>
                  <input
                    type="radio"
                    value="A"
                    checked={anchorWeek === 'A'}
                    onChange={(e) => setAnchorWeek(e.target.value)}
                  />
                  Week A
                </label>
                <label>
                  <input
                    type="radio"
                    value="B"
                    checked={anchorWeek === 'B'}
                    onChange={(e) => setAnchorWeek(e.target.value)}
                  />
                  Week B
                </label>
              </div>
            </div>

            <label>
              <input
                type="checkbox"
                checked={anchorFirstOfMonth}
                onChange={(e) => setAnchorFirstOfMonth(e.target.checked)}
              />
              First of Month (applies first-of-month bonus)
            </label>

            <div style={{ color: '#666', fontSize: '12px', marginTop: '10px' }}>
              <p>✅ Anchor date set: {anchorDate} (Week {anchorWeek})</p>
              <p>System will auto-calculate all future week types based on this anchor.</p>
            </div>
          </div>

          <h3>Messages</h3>
          <label>Poll Message:</label>
          <textarea
            value={pollMessage}
            onChange={(e) => setPollMessage(e.target.value)}
            style={{ width: '100%', minHeight: '80px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
            placeholder="Hi! Are you available? Vote here: {LINK} Closes: {CUTOFF}"
          />
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div>
          <h2>📊 Analytics</h2>
          <p>Analytics dashboard coming soon...</p>
        </div>
      )}
    </div>
  );
}
