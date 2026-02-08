const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createAppUser = functions.https.onCall(async (data, context) => {
  // Only owner can create users
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Not logged in"
    );
  }

  const ownerUid = context.auth.uid;

  const { email, password, full_name, contact_number, role, status } = data;

  if (!email || !password || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields"
    );
  }

  try {
    // Create Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: full_name,
    });

    // Save to Firestore
    await admin
      .firestore()
      .collection("app_users")
      .doc(userRecord.uid)
      .set({
        full_name,
        email,
        contact_number: contact_number || null,
        role,
        status: status || "active",
        owner_uid: ownerUid,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});
