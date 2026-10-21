Here is the full translated text into English, maintaining the strict, mandatory technical tone and precise structure of the original document:

---

# PsyAI — Security & Privacy Rules Specification (AI Build Rules)

Mandatory instructions for any Artificial Intelligence assistant developing this system. These rules are fully binding. Any code, architecture design, or technical decision must adhere strictly to these specifications without exception. Deviation or "individual improvisation" outside this scope is strictly forbidden unless explicitly authorized and documented. In any conflict between development simplicity and these rules, **the security rule always wins.**

---

### 0. Non-Negotiable Principles

* **Defense in Depth:** Every layer operates under the assumption that the preceding layer could be compromised — zero implicit trust between layers.
* **Least Privilege:** Every component (Service, Role, Token) receives only the minimum necessary privileges required to execute its specific task.
* **Fail Secure:** Any unexpected system error must result in request denial (Deny by Default).
* **No Security by Obscurity:** Security relies strictly on real cryptography and authorization controls, never on hiding field names or endpoint URIs.
* **Explicit over Implicit:** Every permission or security exception must be explicitly declared in code, not inferred from default library behaviors.

---

### 1. Architecture Layers

* **Edge / WAF Layer:** WAF + IP-level Rate Limiting + Strict TLS 1.3 enforcement exclusively.
* **API Gateway & Middleware:** Token validation, Route Guards, MFA enforcement.
* **Business & Auth Logic:** OAuth processing, Authentication State Machine, Notification Bus.
* **Data & Security Infrastructure:** RLS enforcement, KMS integration, Field-Level Encryption, Audit Log Store.

> **Strict Rule:** No layer is permitted to access the database directly — all data access must pass through the Business Logic Layer enforcing Row-Level Security (RLS).

---

### 2. Authentication State Machine

```
Google OAuth Success
       │
       ▼
IF phone_verified == false:
  ├── Issue Restricted Token (Scoped JWT, 10 min expiry, scope: ["verify-otp"] ONLY)
  └── POST /api/v1/auth/verify-otp is the ONLY allowed endpoint
ELSE:
  └── Issue Full Session (Access Token + Refresh Token)

```

* **Mandatory Rules:**
* The **Restricted Token** is strictly prohibited from containing any scope other than `verify-otp`.
* Any attempt to use a Restricted Token on an unauthorized endpoint results in an immediate **403 Forbidden** and is logged as suspicious activity in the Audit Log.
* **(Gap Fix):** The Restricted Token must be bound to the device/session context (via device fingerprint or IP hash) to prevent replay attacks from secondary sources.



---

### 3. Password Rules

* **Hashing Standard:** **Argon2id exclusively** — Parameters: Memory Cost $\ge$ 64MB, Time Cost $\ge$ 3, Parallelism = 4, with a minimum 16-byte cryptographically random salt per user.
* Plaintext passwords or reversible formats are strictly prohibited from being saved anywhere (logs, cache, or raw DB columns).
* **Password Policy:** Minimum length of 10 characters; enforced checks against known breached passwords (utilizing an offline/hashed database such as Have I Been Pwned).
* **Password Reset Flow:**
* Generate a cryptographically secure random token (CSPRNG) of 32 bytes length.
* Store only the hashed representation of the token in the database — **never store raw tokens.**
* Expiration time $\le$ 10 minutes, strictly single-use, and deleted immediately after usage or expiration.
* Upon successful password reset, **revoke all active sessions** (JWTs / Refresh Tokens) across all devices without exception.
* **Mandatory Anti-Enumeration:** Any reset request (whether the email exists or not) must yield an identical response: `200 OK — "If the email exists, a reset link was sent"`. Any response difference in timing or messaging that reveals user registration status is strictly forbidden.



---

### 4. OTP Verification Rules

* **Generation:** 6 numeric digits generated strictly via a CSPRNG.
* **(Gap Fix) Storage:** Argon2id must **not** be used for short OTPs — due to the small search space ($10^6$), Argon2id's computational delay provides no security advantage; protection relies on Rate Limiting. Correct methodology:
* Store only the output of `HMAC-SHA256(OTP, server_side_pepper)`.
* The pepper must reside in a dedicated KMS/Secret Manager, never hardcoded or stored in the database.


* **Expiration:** Maximum lifetime of 3 minutes.
* **Rate Limiting:**
* Maximum 3 OTP request attempts per phone number/IP per hour.
* Maximum 3 failed input attempts $\rightarrow$ immediate token invalidation + 15-minute phone number lockout.


* **(Gap Fix):** After the first failed attempt on `/request-otp` or `/reset-password`, mandatory CAPTCHA validation (hCaptcha/reCAPTCHA) is triggered before accepting further requests from that source.

---

### 5. Session & Token Management Rules

* **Storage:** HTTP-Only, Secure, SameSite=Strict cookies exclusively. Storing tokens in `localStorage` or `sessionStorage` is strictly forbidden.
* **Lifespans:** Access Tokens must be short-lived ($\le$ 15 minutes). Refresh Tokens use rotation (every valid request yields a new Refresh Token while invalidating the old one).
* **(Gap Fix) Mandatory User Session Controls:**
* An "Active Devices" interface must display: device type, last active timestamp, and approximate IP-based location.
* Users must have the capability to remotely terminate any active session.
* Any sensitive account modification (password, email, phone number) triggers automatic revocation of all other active sessions.



---

### 6. Authorization & Data Isolation (RLS)

* **Database-Level RLS:** Enforced at the database engine level (not just within application code). A specialist (`ROLE_SPECIALIST`) can query only records explicitly linked to their `specialist_id`.
* **Pseudonymization:** Personal Identifiable Information (PII) tables (Name, Phone, Email) are strictly separated from appointment and clinical record tables, joined exclusively via UUIDv4 identifiers.
* **(Gap Fix) Secure Specialist Access Mechanism:** Specialists must never access the PII table directly. Access is mediated strictly through a restricted view (`Secure Join View`) that exposes only necessary operational data (e.g., Patient First Name + Appointment Time) for assigned appointments, omitting all secondary PII (phone numbers, email addresses, residential addresses).
* Every query executed through this View must generate an automatic entry in the Audit Log.

---

### 7. Audit Logging Rules

* System deployment to production without complete Audit Logging capabilities is prohibited.
* Every read or write operation involving Sensitive Health Information (PHI) or Personal Data (PII) must be captured in the following structure:

$$\text{\{ actor\_id, actor\_role, action, resource\_id, timestamp, ip\_hash, result \}}$$


* **Audit Log Protections:**
* **Append-only architecture** (no edits or deletions permitted, even by system administrators).
* Maintained in an isolated storage datastore separate from primary application data.
* Log payloads must never contain sensitive data values — only metadata tracking access operations.
* Any unauthorized attempt by a specialist to view patient records outside scheduled appointments triggers an immediate system deny and security alert.



---

### 8. Data Protection & Encryption Rules

* **At Rest:** Full disk-level encryption + mandatory **Field-Level Encryption** for sensitive fields (such as therapy session notes or diagnostic entries) using KMS keys managed separately from disk encryption keys.
* **In Transit:** TLS 1.3 enforced across all transport paths — including internal microservice-to-microservice calls.
* Sensitive health data, notes, or diagnostic information must never be exposed in API responses unless explicitly scoped to the validated data owner or assigned specialist.

---

### 9. Notifications Rules

* **SMS/WhatsApp Communication:** Must use neutral wording strictly limited to system alerts:
> *"Reminder: You have an upcoming appointment in 30 minutes. Please log into the app for details."*


* Communications outside the app (SMS, basic email, push notification body text visible on lock screens) are strictly forbidden from containing specialist names, session nature, or medical/psychological terms.
* Administrative or specialist notifications are handled exclusively inside dedicated control panels under `ROLE_SPECIALIST` authorization, never broadcast over unencrypted external channels.

---

### 10. Data Retention & Deletion Rules

* Enforce programmatic data retention policies matching applicable legal and regulatory frameworks.
* **Right to Erasure (Account Deletion):** Upon user account deletion requests:
* Anonymize or permanently delete all associated PII fields immediately.
* Retained appointment metadata required by legal obligation must be permanently decoupled from user identity records.
* Audit Logs tied to the user account must not be purged immediately; they remain in immutable storage for security audit purposes.



---

### 11. Input Validation Rules

* Mandatory validation using schema validation libraries (e.g., Zod, Joi) on all incoming requests — enforcing strict sanitization against XSS and SQL Injection attacks.
* Frontend validation must never be relied upon alone; all validation steps must be fully re-executed on the backend infrastructure.
* Enforce strict **whitelist-based validation patterns** (defining explicitly allowed inputs) rather than blacklist-based checks.

---

### 12. Logging & Error Handling Rules

* Printing, logging, or capturing sensitive credentials (passwords, OTPs, Bearer tokens, Refresh tokens, phone numbers, session contents) in any output mechanism (console, file loggers, Sentry) is strictly forbidden.
* Client-facing error responses must remain generic (e.g., `"Invalid credentials"`), omitting whether errors stem from incorrect emails, passwords, or phone numbers to prevent enumeration.
* Stack traces or internal system debugging details must be stripped entirely from client-facing production responses.

---

### 13. Absolute Prohibitions Summary

If any generated code violates even a single item in this list, the code is considered **automatically rejected**, regardless of any other considerations:

* 🚫 Storing tokens in `localStorage` or `sessionStorage`.
* 🚫 Utilizing Argon2id (or any slow hashing algorithm) for OTP hashing.
* 🚫 Returning error messages that disclose account existence (Account Enumeration).
* 🚫 Printing passwords, OTPs, tokens, or phone numbers in any application log.
* 🚫 Direct database access from any Service without passing through Row-Level Security (RLS).
* 🚫 Exposing medical or psychological details within external SMS or push notifications.
* 🚫 Storing OTPs or Password Reset Tokens in plaintext (unhashed).
* 🚫 Deploying sensitive endpoints without active Rate Limiting middleware.
* 🚫 Specialist access to primary user PII (phone, email, home address) through any route.
* 🚫 Modifying or deleting Audit Log entries under any circumstances.
* 🚫 Issuing a Full Session token to an unverified phone account (`phone_verified == false`).

---

**Final Directive for Executing AI:** When encountering any design ambiguity not explicitly detailed in these rules, always select the most restrictive option (**Fail Secure**). Never grant exceptions for development convenience or user experience tradeoffs.