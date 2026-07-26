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

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('No s\'ha pogut activar la persistència local de la sessió.', error);
});

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  await persistenceReady;
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function register(displayName, email, password) {
  await persistenceReady;
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanName = displayName.trim();
  if (cleanName) {
    await updateProfile(credential.user, { displayName: cleanName });
  }
  return credential;
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function logout() {
  return signOut(auth);
}

function scheduleCollection(uid) {
  return collection(db, 'users', uid, 'horariSetmanal');
}

function settingsDocument(uid) {
  return doc(db, 'users', uid, 'settings', 'preferences');
}

export function watchScheduleEntries(uid, onData, onError = console.error) {
  return onSnapshot(
    scheduleCollection(uid),
    snapshot => {
      onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    },
    onError
  );
}

export async function saveScheduleEntry(uid, entry, id = null) {
  const payload = {
    ...entry,
    updatedAt: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, 'users', uid, 'horariSetmanal', id), payload);
    return id;
  }

  const reference = await addDoc(scheduleCollection(uid), {
    ...payload,
    createdAt: serverTimestamp()
  });
  return reference.id;
}

export async function removeScheduleEntry(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'horariSetmanal', id));
}

export function watchPreferences(uid, onData, onError = console.error) {
  return onSnapshot(
    settingsDocument(uid),
    snapshot => onData(snapshot.exists() ? snapshot.data() : null),
    onError
  );
}

export async function savePreferences(uid, preferences) {
  await setDoc(settingsDocument(uid), {
    ...preferences,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function replaceScheduleEntries(uid, entries) {
  const current = await getDocs(scheduleCollection(uid));
  let batch = writeBatch(db);
  let operations = 0;

  const commitIfNeeded = async force => {
    if (operations === 0) return;
    if (force || operations >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      operations = 0;
    }
  };

  for (const item of current.docs) {
    batch.delete(item.ref);
    operations += 1;
    await commitIfNeeded(false);
  }

  for (const entry of entries) {
    const reference = doc(scheduleCollection(uid));
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, updatedAt: _ignoredUpdatedAt, ...cleanEntry } = entry;
    batch.set(reference, {
      ...cleanEntry,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    operations += 1;
    await commitIfNeeded(false);
  }

  await commitIfNeeded(true);
}
