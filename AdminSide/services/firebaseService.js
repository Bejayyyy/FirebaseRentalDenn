/**
 * Firebase service layer - AdminSide
 * All data operations are USER-SCOPED: only the logged-in user's data is accessed.
 * Multi-tenant: each business owner sees only their own vehicles, bookings, etc.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword, onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";

// ============ AUTH ============
export const firebaseAuth = {
  signInWithPassword: (email, password) =>
    signInWithEmailAndPassword(auth, email, password),

  signOut: () => signOut(auth),

  resetPasswordForEmail: (email) => sendPasswordResetEmail(auth, email),

  updatePassword: (newPassword) => {
    const user = auth.currentUser;
    if (!user) throw new Error("User must be logged in");
    return updatePassword(user, newPassword);
  },

  getCurrentUser: () => auth.currentUser,

  onAuthStateChange: (callback) => onAuthStateChanged(auth, callback),
};

// ============ HELPERS ============
const requireUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("User must be logged in");
  return user.uid;
};

const toFirestore = (obj) => {
  if (!obj) return obj;
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] instanceof Date) out[k] = Timestamp.fromDate(out[k]);
  }
  return out;
};

const fromFirestore = (docSnap) => {
  if (!docSnap?.exists()) return null;
  const d = docSnap.data();
  const id = docSnap.id;
  const out = { id, ...d };
  for (const k of Object.keys(out)) {
    if (out[k]?.toDate) out[k] = out[k].toDate();
  }
  return out;
};

const fromFirestoreList = (snapshot) =>
  snapshot.docs.map((d) => fromFirestore(d));

// ============ VEHICLES (user-scoped) ============
export const vehiclesService = {
  list: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicles"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  subscribe: (onData, onError) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicles"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    return onSnapshot(q, (snap) => onData(fromFirestoreList(snap)), onError);
  },

  add: async (data) => {
    const userId = requireUserId();
    const ref = await addDoc(collection(db, "vehicles"), {
      ...toFirestore(data),
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },

  update: async (id, data) => {
    const userId = requireUserId();
    const d = doc(db, "vehicles", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Vehicle not found or access denied");
    }
    await updateDoc(d, { ...data, updated_at: serverTimestamp() });
  },

  delete: async (id) => {
    const userId = requireUserId();
    const d = doc(db, "vehicles", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Vehicle not found or access denied");
    }
    // Delete associated variants first
    const vq = query(
      collection(db, "vehicle_variants"),
      where("vehicle_id", "==", id),
      where("user_id", "==", userId)
    );
    const vSnap = await getDocs(vq);
    const batch = writeBatch(db);
    vSnap.docs.forEach((vd) => batch.delete(vd.ref));
    batch.delete(d);
    await batch.commit();
  },

  getById: async (id) => {
    const userId = requireUserId();
    const snap = await getDoc(doc(db, "vehicles", id));
    const v = fromFirestore(snap);
    if (!v || v.user_id !== userId) return null;
    return v;
  },
};

// ============ VEHICLE VARIANTS (user-scoped) ============
export const variantsService = {
  list: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("user_id", "==", userId),
      orderBy("color", "asc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  listByOwnerId: async (ownerId) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("owner_id", "==", ownerId),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  listByVehicleId: async (vehicleId) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("vehicle_id", "==", vehicleId),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  listAvailable: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("user_id", "==", userId),
      where("available_quantity", ">", 0)
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  listWithVehicles: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    const variants = fromFirestoreList(snap);
    const vehicleIds = [...new Set(variants.map((v) => v.vehicle_id).filter(Boolean))];
    const vehiclesMap = {};
    await Promise.all(vehicleIds.map(async (vid) => { vehiclesMap[vid] = await getVehicleById(vid); }));
    return variants.map((v) => ({ ...v, vehicles: vehiclesMap[v.vehicle_id] || null }));
  },

  listAvailableWithVehicles: async () => {
    const variants = await (async () => {
      const userId = requireUserId();
      const q = query(
        collection(db, "vehicle_variants"),
        where("user_id", "==", userId),
        where("available_quantity", ">", 0)
      );
      const snap = await getDocs(q);
      return fromFirestoreList(snap);
    })();
    const vehicleIds = [...new Set(variants.map((v) => v.vehicle_id).filter(Boolean))];
    const vehiclesMap = {};
    await Promise.all(vehicleIds.map(async (vid) => { vehiclesMap[vid] = await getVehicleById(vid); }));
    return variants.map((v) => ({
      ...v,
      vehicles: vehiclesMap[v.vehicle_id] || null,
    }));
  },

  subscribe: (onData, onError) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("user_id", "==", userId),
      orderBy("color", "asc")
    );
    return onSnapshot(q, (snap) => onData(fromFirestoreList(snap)), onError);
  },

  add: async (data) => {
    const userId = requireUserId();
    const ref = await addDoc(collection(db, "vehicle_variants"), {
      ...toFirestore(data),
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },

  update: async (id, data) => {
    const userId = requireUserId();
    const d = doc(db, "vehicle_variants", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Variant not found or access denied");
    }
    await updateDoc(d, { ...data, updated_at: serverTimestamp() });
  },

  deleteByVehicleId: async (vehicleId) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "vehicle_variants"),
      where("vehicle_id", "==", vehicleId),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  },

  getById: async (id) => {
    const snap = await getDoc(doc(db, "vehicle_variants", id));
    return fromFirestore(snap);
  },

  adjustQuantity: async (variantId, change) => {
    const d = doc(db, "vehicle_variants", variantId);
    const snap = await getDoc(d);
    if (!snap.exists()) throw new Error("Variant not found");
    const v = snap.data();
    const userId = requireUserId();
    if (v.user_id !== userId) throw new Error("Access denied");
    const avail = (v.available_quantity ?? 0) + change;
    const total = v.total_quantity ?? 1;
    await updateDoc(d, {
      available_quantity: Math.max(0, Math.min(avail, total)),
      updated_at: serverTimestamp(),
    });
  },
};

// ============ BOOKINGS (user-scoped) ============
const getVehicleById = async (id) => {
  if (!id) return null;
  const snap = await getDoc(doc(db, "vehicles", id));
  return fromFirestore(snap);
};
const getVariantById = async (id) => {
  if (!id) return null;
  const snap = await getDoc(doc(db, "vehicle_variants", id));
  return fromFirestore(snap);
};

export const bookingsService = {
  list: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "bookings"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  subscribe: (onData, onError) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "bookings"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    return onSnapshot(q, (snap) => onData(fromFirestoreList(snap)), onError);
  },

  add: async (data) => {
    const userId = requireUserId();
    const ref = await addDoc(collection(db, "bookings"), {
      ...toFirestore(data),
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },

  update: async (id, data) => {
    const userId = requireUserId();
    const d = doc(db, "bookings", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Booking not found or access denied");
    }
    await updateDoc(d, { ...data, updated_at: serverTimestamp() });
  },

  delete: async (id) => {
    const userId = requireUserId();
    const d = doc(db, "bookings", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Booking not found or access denied");
    }
    await deleteDoc(d);
  },

  getById: async (id) => {
    const snap = await getDoc(doc(db, "bookings", id));
    const b = fromFirestore(snap);
    if (!b) return null;
    const userId = requireUserId();
    if (b.user_id !== userId) return null;
    return b;
  },

  listByVariantIds: async (variantIds) => {
    if (!variantIds?.length) return [];
    const bookings = await bookingsService.list();
    return bookings.filter((b) => variantIds.includes(b.vehicle_variant_id));
  },

  listWithDetails: async () => {
    const bookings = await bookingsService.list();
    const vehicleIds = [...new Set(bookings.map((b) => b.vehicle_id).filter(Boolean))];
    const variantIds = [...new Set(bookings.map((b) => b.vehicle_variant_id).filter(Boolean))];
    const vehiclesMap = {};
    const variantsMap = {};
    await Promise.all(vehicleIds.map(async (vid) => { vehiclesMap[vid] = await getVehicleById(vid); }));
    await Promise.all(variantIds.map(async (vid) => { variantsMap[vid] = await getVariantById(vid); }));
    return bookings.map((b) => ({
      ...b,
      vehicles: vehiclesMap[b.vehicle_id] || null,
      vehicle_variants: variantsMap[b.vehicle_variant_id] || null,
    }));
  },
};

// ============ CAR OWNERS (user-scoped) ============
export const carOwnersService = {
  list: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "car_owners"),
      where("user_id", "==", userId),
      where("status", "==", "active"),
      orderBy("name", "asc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  listAll: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "car_owners"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  subscribe: (onData, onError) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "car_owners"),
      where("user_id", "==", userId),
      orderBy("name", "asc")
    );
    return onSnapshot(q, (snap) => onData(fromFirestoreList(snap)), onError);
  },

  add: async (data) => {
    const userId = requireUserId();
    const ref = await addDoc(collection(db, "car_owners"), {
      ...toFirestore(data),
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },

  update: async (id, data) => {
    const userId = requireUserId();
    const d = doc(db, "car_owners", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Car owner not found or access denied");
    }
    await updateDoc(d, { ...data, updated_at: serverTimestamp() });
  },

  delete: async (id) => {
    const userId = requireUserId();
    const d = doc(db, "car_owners", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Car owner not found or access denied");
    }
    await deleteDoc(d);
  },

  getById: async (id) => {
    const snap = await getDoc(doc(db, "car_owners", id));
    const o = fromFirestore(snap);
    if (!o) return null;
    const userId = requireUserId();
    if (o.user_id !== userId) return null;
    return o;
  },
};

// ============ NOTIFICATIONS (user-scoped) ============
export const notificationsService = {
  list: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  listUnread: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("dismissed", "==", false),
      orderBy("created_at", "desc")
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  subscribe: (onData, onError) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    return onSnapshot(q, (snap) => onData(fromFirestoreList(snap)), onError);
  },

  add: async (data) => {
    const userId = requireUserId();
    const ref = await addDoc(collection(db, "notifications"), {
      ...toFirestore(data),
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },

  update: async (id, data) => {
    const userId = requireUserId();
    const d = doc(db, "notifications", id);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Notification not found or access denied");
    }
    await updateDoc(d, { ...data, updated_at: serverTimestamp() });
  },

  listByBookingId: async (bookingId) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("booking_id", "==", bookingId),
      where("dismissed", "==", false)
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  markAllDismissed: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("dismissed", "==", false)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { dismissed: true, updated_at: serverTimestamp() }));
    if (snap.docs.length > 0) await batch.commit();
  },

  markAllRead: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("read", "==", false)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true, updated_at: serverTimestamp() }));
    if (snap.docs.length > 0) await batch.commit();
  },
};

// ============ WEBSITE CONTENT (user-scoped) ============
export const websiteContentService = {
  getBySection: async (section) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "website_content"),
      where("user_id", "==", userId),
      where("section", "==", section)
    );
    const snap = await getDocs(q);
    const list = fromFirestoreList(snap);
    return list[0] || null;
  },

  upsert: async (section, data) => {
    const userId = requireUserId();
    const q = query(
      collection(db, "website_content"),
      where("user_id", "==", userId),
      where("section", "==", section)
    );
    const snap = await getDocs(q);
    const existing = snap.docs[0];
    const payload = { ...data, section, user_id: userId, updated_at: serverTimestamp() };
    if (existing) {
      await updateDoc(existing.ref, payload);
      return { id: existing.id };
    }
    const ref = await addDoc(collection(db, "website_content"), {
      ...payload,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },
};

// ============ GALLERY (user-scoped) ============
export const galleryService = {
  list: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "gallery"),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  getImages: async (galleryId) => {
    const userId = requireUserId();
    const gRef = doc(db, "gallery", galleryId);
    const gSnap = await getDoc(gRef);
    if (!gSnap.exists() || gSnap.data().user_id !== userId) return [];
    const q = query(
      collection(db, "gallery_images"),
      where("gallery_id", "==", galleryId),
      where("is_active", "==", true)
    );
    const snap = await getDocs(q);
    return fromFirestoreList(snap);
  },

  addImage: async (galleryId, data) => {
    const userId = requireUserId();
    const gRef = doc(db, "gallery", galleryId);
    const gSnap = await getDoc(gRef);
    if (!gSnap.exists() || gSnap.data().user_id !== userId) {
      throw new Error("Gallery not found or access denied");
    }
    const ref = await addDoc(collection(db, "gallery_images"), {
      ...toFirestore(data),
      gallery_id: galleryId,
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return { id: ref.id };
  },

  deleteImage: async (imageId) => {
    const userId = requireUserId();
    const d = doc(db, "gallery_images", imageId);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Image not found or access denied");
    }
    await deleteDoc(d);
  },

  updateImage: async (imageId, data) => {
    const userId = requireUserId();
    const d = doc(db, "gallery_images", imageId);
    const snap = await getDoc(d);
    if (!snap.exists() || snap.data().user_id !== userId) {
      throw new Error("Image not found or access denied");
    }
    await updateDoc(d, { ...data, updated_at: serverTimestamp() });
  },

  getOrCreateGallery: async () => {
    const userId = requireUserId();
    const q = query(
      collection(db, "gallery"),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    if (snap.docs.length > 0) return snap.docs[0].id;
    const ref = await addDoc(collection(db, "gallery"), {
      user_id: userId,
      created_at: serverTimestamp(),
    });
    return ref.id;
  },

  listImagesForUser: async () => {
    const galleryId = await galleryService.getOrCreateGallery();
    return galleryService.getImages(galleryId);
  },

  addImageToUserGallery: async (data) => {
    const galleryId = await galleryService.getOrCreateGallery();
    return galleryService.addImage(galleryId, data);
  },
};

// ============ STORAGE ============
export const storageService = {
  uploadGovId: async (fileName, blob) => {
    const userId = requireUserId();
    const path = `gov_ids/${userId}/${fileName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  },

  uploadGalleryImage: async (fileName, blob) => {
    const userId = requireUserId();
    const path = `gallery/${userId}/${fileName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  },

  uploadVehicleImage: async (path, blob) => {
    const userId = requireUserId();
    const fullPath = `vehicle-images/${userId}/${path}`;
    const storageRef = ref(storage, fullPath);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  },

  getPublicUrl: (path) => {
    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef);
  },
};

// ============ DEBUG ============
export const debugConnectivity = async () => {
  const results = {};
  try {
    const res = await fetch("https://www.gstatic.com/generate_204", { method: "GET" });
    results.internet = res.ok;
  } catch (e) {
    results.internet = false;
    results.internetError = String(e?.message || e);
  }
  try {
    const user = auth.currentUser;
    results.authSession = !!user;
    if (!user) results.authSessionError = "Not logged in";
  } catch (e) {
    results.authSession = false;
    results.authSessionError = String(e?.message || e);
  }
  console.log("[ConnectivityDebug]", results);
  return results;
};
