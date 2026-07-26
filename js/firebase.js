import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCrDmpdYr9c55SR2ZbNsYVBzsgXxHM9h5k',
  authDomain: 'programeta-cc218.firebaseapp.com',
  projectId: 'programeta-cc218',
  storageBucket: 'programeta-cc218.firebasestorage.app',
  messagingSenderId: '1004120651589',
  appId: '1:1004120651589:web:9313cd2adf287f8c5e302c'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('No s\'ha pogut establir la persistència local de la sessió.', error);
});

function userRef(uid) {
  return doc(db, 'users', uid);
}

function activitiesRef(uid) {
  return collection(db, 'users', uid, 'horariSetmanal');
}

function activityRef(uid, activityId) {
  return doc(db, 'users', uid, 'horariSetmanal', activityId);
}

function settingsRef(uid) {
  return doc(db, 'users', uid, 'settings', 'general');
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function registerWithEmail(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(userRef(credential.user.uid), {
    displayName: name.trim(),
    email: credential.user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  }, { merge: true });
  return credential;
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function logout() {
  return signOut(auth);
}

export async function ensureUserProfile(user) {
  if (!user) return;
  await setDoc(userRef(user.uid), {
    displayName: user.displayName || '',
    email: user.email || '',
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  }, { merge: true });
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(userRef(uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function getUserSettings(uid) {
  const snapshot = await getDoc(settingsRef(uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserSettings(uid, settings) {
  await setDoc(settingsRef(uid), {
    ...settings,
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  }, { merge: true });
}

export function subscribeActivities(uid, onData, onError) {
  return onSnapshot(
    activitiesRef(uid),
    snapshot => {
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      onData(rows);
    },
    onError
  );
}

export async function listAllActivities(uid) {
  const snapshot = await getDocs(activitiesRef(uid));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function addActivity(uid, activity) {
  return addDoc(activitiesRef(uid), {
    ...activity,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  });
}

export async function updateActivity(uid, activityId, activity) {
  return updateDoc(activityRef(uid, activityId), {
    ...activity,
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  });
}

export async function deleteActivity(uid, activityId) {
  return deleteDoc(activityRef(uid, activityId));
}

export async function createOccurrenceException(uid, permanentActivity, year, week, date) {
  return addDoc(activitiesRef(uid), {
    tipus: 'excepcio',
    any: year,
    setmana: week,
    data: date,
    dia: permanentActivity.dia,
    hora: permanentActivity.hora,
    referenciaPermanentId: permanentActivity.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  });
}

export async function exportUserBackup(uid) {
  const [profile, settings, activities] = await Promise.all([
    getUserProfile(uid),
    getUserSettings(uid),
    listAllActivities(uid)
  ]);

  return {
    format: 'programeta-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile,
    settings,
    activities: activities.map(({ id, createdAt, updatedAt, ...activity }) => ({
      originalId: id,
      ...activity
    }))
  };
}

export async function restoreUserBackup(uid, backup) {
  if (!backup || backup.format !== 'programeta-backup' || !Array.isArray(backup.activities)) {
    throw new Error('El fitxer no és una còpia vàlida de Programeta.');
  }

  const existingSnapshot = await getDocs(activitiesRef(uid));
  const writeOperations = [];

  existingSnapshot.docs.forEach(existing => {
    writeOperations.push({ type: 'delete', ref: existing.ref });
  });

  backup.activities.forEach((activity, index) => {
    const { originalId, ...data } = activity;
    const reference = originalId
      ? activityRef(uid, originalId)
      : doc(activitiesRef(uid));

    writeOperations.push({
      type: 'set',
      ref: reference,
      data: {
        ...data,
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 2,
        restoreOrder: index
      }
    });
  });

  for (let offset = 0; offset < writeOperations.length; offset += 450) {
    const batch = writeBatch(db);
    writeOperations.slice(offset, offset + 450).forEach(operation => {
      if (operation.type === 'delete') batch.delete(operation.ref);
      else batch.set(operation.ref, operation.data, { merge: false });
    });
    await batch.commit();
  }

  if (backup.settings) {
    await saveUserSettings(uid, backup.settings);
  }

  if (backup.profile) {
    const { id, createdAt, updatedAt, ...profileData } = backup.profile;
    await setDoc(userRef(uid), {
      ...profileData,
      updatedAt: serverTimestamp(),
      schemaVersion: 2
    }, { merge: true });
  }
}
