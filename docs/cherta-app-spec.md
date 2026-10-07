# Cherta App — Full Project Idea & Technical Specification

## 1. Project Overview

**Cherta** is a Lowest Unique Bid Auction Platform for web and mobile.

A seller/auction owner creates an auction for a product such as a
smartphone, TV, appliance, or other item. Participants join an auction
and submit bids according to the auction rules.

When the auction closes, the system counts all valid bids. A bid is
**unique** when that exact amount was submitted only once. The winner is
the participant whose bid is the **lowest unique bid**.

Example:

``` text
1.00 ETB → 2 bids
2.00 ETB → 1 bid   ← Winning amount
3.00 ETB → 2 bids
4.00 ETB → 1 bid
```

The lowest unique amount is **2.00 ETB**, so the participant who
submitted 2.00 ETB wins.

> **Legal/compliance note:** If the platform uses real money, paid bids,
> prizes, or chance-based participation, the applicable Ethiopian laws,
> licenses, consumer-protection requirements, payment rules, tax
> requirements, and other compliance obligations must be verified before
> production launch.

------------------------------------------------------------------------

# 2. Main User Roles

## A. Participant / User

A normal user can:

-   Register
-   Log in
-   Browse live auctions
-   View auction details
-   Join an auction
-   Submit bids
-   View their own bids
-   View active and completed auctions
-   View results
-   Receive notifications
-   Manage registered devices
-   View won auctions

## B. Auction Owner / Seller

An auction owner can:

-   Create an account
-   Complete owner verification if required
-   Add a product
-   Create an auction
-   Set auction rules
-   Set bid/service fee if applicable
-   Set start and end time
-   Set maximum bids per user if applicable
-   Publish an auction
-   Monitor auction activity
-   Close the auction
-   View the calculated result
-   Manage the product after completion

## C. Admin

Admin can:

-   Manage users
-   Review/verify auction owners
-   Review auctions
-   Moderate products
-   Monitor payments
-   Monitor reports and complaints
-   Review suspicious activity
-   View audit logs
-   Manage categories
-   Manage system settings
-   Suspend or activate accounts where appropriate

------------------------------------------------------------------------

# 3. Language System

The app must support **two languages from the beginning**:

-   **English**
-   **Amharic (አማርኛ)**

## Language Menu

The main menu should contain a language selector:

``` text
Language
├── English
└── አማርኛ
```

Example UI:

``` text
🌐 EN ▼
```

When opened:

``` text
English
አማርኛ
```

The selected language should be saved for the user's next visit.

## Localization Requirements

All user-facing text should be stored as translation keys rather than
hard-coded directly into UI components.

Example:

``` text
home.title
auction.live
auction.submit_bid
auction.remaining_time
winner.title
profile.my_bids
menu.home
menu.winners
menu.auctions
menu.faq
menu.contact
```

English translation:

``` text
menu.home = Home
menu.winners = Winners
menu.auctions = Auctions
menu.faq = FAQ
menu.contact = Contact Us
```

Amharic translation:

``` text
menu.home = መነሻ
menu.winners = አሸናፊዎች
menu.auctions = ጨረታዎች
menu.faq = ተደጋጋሚ ጥያቄዎች
menu.contact = ያግኙን
```

The layout must support Amharic text correctly, including appropriate
fonts, line wrapping, spacing, and mobile responsiveness.

------------------------------------------------------------------------

# 4. Home Screen

The Home screen should include:

-   App logo/name
-   Search
-   Language selector
-   Notifications
-   User profile
-   Live Auctions
-   Upcoming Auctions
-   Featured Auctions
-   Categories
-   Recently Completed Auctions
-   Winners Gallery
-   FAQ
-   Contact Us

## Main Navigation

``` text
Home
Auctions
Winners
FAQ
Contact Us
Profile
```

With language switching:

``` text
English
አማርኛ
```

------------------------------------------------------------------------

# 5. Auction Card

Each auction card can show:

-   Product image
-   Product name
-   Category
-   Auction code
-   Bid/service fee
-   Remaining time
-   Number of bids
-   Auction status
-   View Auction button
-   Submit Bid button where appropriate

Example:

``` text
Samsung Galaxy A17
Mobile Phones

Auction Code: 218
Bid Service Fee: 50 ETB
Time Remaining: 08d : 04h : 52m
798 Bids

[ View Auction ]
```

------------------------------------------------------------------------

# 6. Auction Details Screen

Example:

``` text
Samsung Galaxy A17 Smartphone

Auction Code: 218
Status: LIVE
Bid Service Fee: 50 ETB
Remaining Time: 08d : 04h : 52m
Total Bids: 798
```

## Bid Section

``` text
Bid Amount

[-]     2.50 ETB     [+]

[ Submit a Bid ]
```

The server must validate:

-   Auction is still live
-   User is authenticated
-   Bid amount is valid
-   Bid is within configured limits
-   User has the required bid entitlement/payment where applicable
-   User has not exceeded configured bid limits

------------------------------------------------------------------------

# 7. Lowest Unique Bid Algorithm

This is the core business logic.

## Example

``` text
1.00 ETB → 2 bids
2.00 ETB → 1 bid
3.00 ETB → 2 bids
4.00 ETB → 1 bid
```

The unique bids are:

``` text
2.00 ETB
4.00 ETB
```

The lowest unique bid is:

``` text
2.00 ETB
```

Therefore, the user who submitted 2.00 ETB is the winner.

## Important Rules

-   A bid is unique only if its exact amount occurs once among valid
    bids.
-   Repeated amounts are not unique.
-   Only valid bids are included in the calculation.
-   Bids submitted after the auction closes are rejected.
-   The result calculation must run on the trusted backend/server.
-   The final result should be stored with an audit record.

## Pseudocode

``` text
valid_bids = get_valid_bids(auction_id)

count_by_amount = count_each_amount(valid_bids)

unique_bids = [
    bid for bid in valid_bids
    if count_by_amount[bid.amount] == 1
]

if unique_bids is empty:
    result = "NO UNIQUE BID"
else:
    winning_bid = bid_with_lowest_amount(unique_bids)
    winner = winning_bid.user
```

------------------------------------------------------------------------

# 8. Multiple Bids

If the auction rules allow multiple bids per user, one user may submit
several different amounts.

Example:

``` text
User A
├── 1.00 ETB
├── 2.00 ETB
└── 5.00 ETB
```

The system evaluates all valid bids together when the auction closes.

The maximum number of bids per user should be configurable per auction.

------------------------------------------------------------------------

# 9. Auction Lifecycle

``` text
DRAFT
  ↓
PUBLISHED
  ↓
LIVE
  ↓
CLOSED
  ↓
CALCULATING RESULT
  ↓
WINNER CONFIRMED
  ↓
COMPLETED
```

### DRAFT

The owner is preparing the auction.

### PUBLISHED

The auction is visible to users but has not started.

### LIVE

Users can submit valid bids.

### CLOSED

New bids are no longer accepted.

### CALCULATING RESULT

The server calculates the lowest unique bid.

### WINNER CONFIRMED

The result is finalized.

### COMPLETED

The auction and result are stored as completed records.

------------------------------------------------------------------------

# 10. Winners Gallery

The Winners Gallery should show completed auction results.

Each winner card can include:

-   Product image
-   Auction code
-   Product name
-   Winner name
-   Masked phone number
-   Winning amount
-   Date
-   Result/reference code
-   View Results button

Example:

``` text
Samsung Galaxy M36 Smartphone

WINNER
Dawit

AMOUNT
12.54 ETB

PHONE
0917****47

DATE
Sep 12, 2026

AUCTION CODE
213

[ View Results ]
```

## Search and Filters

-   Search winners
-   Category filter
-   Newest First
-   Oldest First
-   Grid/List view
-   Pagination

------------------------------------------------------------------------

# 11. User Profile

``` text
Profile
├── Personal Information
├── My Bids
├── Active Auctions
├── Won Auctions
├── Notifications
├── Device Management
├── Security
├── Language
├── Help
└── Logout
```

The language setting should allow:

``` text
English
አማርኛ
```

------------------------------------------------------------------------

# 12. Device Management

The app should provide an **Add Device** feature for account/device
security.

Example:

``` text
My Devices

iPhone
Status: Active
Last Used: Today

Android Phone
Status: Active
Last Used: Yesterday

[ Add Device ]
```

Security features:

-   Device registration
-   New-device verification
-   New-device notification
-   Revoke/remove device session
-   Suspicious login detection
-   Session management

A device identifier alone must not be treated as the user's
authentication. Secure authentication and server-side authorization
remain mandatory.

------------------------------------------------------------------------

# 13. Notifications

Possible notifications:

-   Auction started
-   Auction ending soon
-   Bid accepted
-   Bid rejected
-   Auction closed
-   Result available
-   You won
-   New device login
-   Security alert
-   System announcement

Notifications should also be localized into English and Amharic.

------------------------------------------------------------------------

# 14. Payment / Service Fee Architecture

If the final product uses real-money payments, the architecture can be:

``` text
User
 ↓
Select Auction
 ↓
Select Bid / Bid Service
 ↓
Payment
 ↓
Payment Provider
 ↓
Server Payment Verification
 ↓
Bid Activated
 ↓
Receipt
```

The system must not mark a payment as successful based only on a
client-side message.

The backend should verify the transaction through the authorized payment
provider.

For development:

-   Fake/Test payment
-   Sandbox environment
-   Test accounts

should be used before any production money flow.

------------------------------------------------------------------------

# 15. Database Structure

## Users

``` text
users
- id
- full_name
- phone
- email
- password_hash
- role
- status
- preferred_language
- created_at
```

## Devices

``` text
devices
- id
- user_id
- device_name
- device_identifier_hash
- verified
- last_seen
- created_at
```

## Products

``` text
products
- id
- owner_id
- name
- description
- category_id
- image_url
- estimated_value
- status
- created_at
```

## Auctions

``` text
auctions
- id
- owner_id
- product_id
- auction_code
- bid_fee
- min_bid
- max_bid
- max_bids_per_user
- start_at
- end_at
- status
- created_at
```

## Bids

``` text
bids
- id
- auction_id
- user_id
- amount
- payment_id
- status
- created_at
```

## Payments

``` text
payments
- id
- user_id
- auction_id
- amount
- provider
- provider_reference
- status
- created_at
```

## Winners

``` text
winners
- id
- auction_id
- user_id
- winning_bid_id
- winning_amount
- result_hash
- published_at
```

## Audit Logs

``` text
audit_logs
- id
- actor_id
- action
- entity_type
- entity_id
- old_value
- new_value
- timestamp
- ip_hash
```

------------------------------------------------------------------------

# 16. Security Architecture

Because the system can involve accounts, payments, and personal
information, security must be designed from the beginning.

## Authentication

-   Secure password hashing
-   Secure sessions/tokens
-   Optional OTP/2FA
-   Rate limiting
-   Account protection against brute-force login attempts

## Authorization

Roles:

``` text
USER
OWNER
ADMIN
```

Each role receives only the permissions required for its
responsibilities.

## Data Protection

-   HTTPS/TLS
-   Password hashing
-   Encryption for appropriate sensitive data
-   Secrets stored outside source code
-   Database access controls
-   Input validation
-   Secure error handling

## Anti-Fraud

-   Rate limiting
-   Duplicate/suspicious bid detection
-   Device/session monitoring
-   Audit logging
-   Server-side validation
-   Payment verification

------------------------------------------------------------------------

# 17. Result Integrity

The winner should be calculated by the trusted backend, not manually
selected by an admin.

Process:

``` text
Auction Closed
      ↓
Freeze Bids
      ↓
Load Valid Bids
      ↓
Count Each Amount
      ↓
Find Unique Amounts
      ↓
Find Lowest Unique Amount
      ↓
Identify Winning Bid
      ↓
Create Result
      ↓
Store Audit Record
      ↓
Publish Result
```

The result should have a permanent audit trail.

A result hash/reference can be stored to make later verification easier.

------------------------------------------------------------------------

# 18. Admin Dashboard

``` text
Dashboard
├── Total Users
├── Active Users
├── Live Auctions
├── Completed Auctions
├── Total Bids
├── Payments
├── Winners
├── Reports
├── Complaints
├── Suspicious Activity
└── Audit Logs
```

Admin functions:

-   Activate/suspend users
-   Verify auction owners
-   Review auctions
-   Moderate products
-   Review reports
-   Monitor system activity
-   Review audit records

------------------------------------------------------------------------

# 19. Recommended Technology Stack

## Frontend

**React / Next.js**

## Backend

**Python + FastAPI**

## Database

**PostgreSQL**

## Authentication

Secure session-based authentication or properly implemented token
authentication with secure password hashing.

## Storage

Object storage for product images and other uploaded media.

## Deployment

Cloud hosting / managed infrastructure.

## Development

Git + GitHub.

------------------------------------------------------------------------

# 20. Project Folder Structure

``` text
cherta-app/
│
├── frontend/
│   ├── pages/
│   ├── components/
│   ├── services/
│   ├── locales/
│   │   ├── en/
│   │   └── am/
│   └── assets/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── auth/
│   │   └── security/
│   │
│   └── tests/
│
├── database/
│   ├── migrations/
│   └── seed/
│
├── docs/
│   ├── requirements.md
│   ├── api.md
│   └── security.md
│
└── README.md
```

------------------------------------------------------------------------

# 21. MVP --- First Version

The first version should focus on the core experience.

## MVP Version 1

1.  Register
2.  Login
3.  English/Amharic language switcher
4.  Home
5.  Auction list
6.  Auction details
7.  Create Auction
8.  Submit Bid
9.  Countdown
10. Close Auction
11. Lowest Unique Bid calculation
12. Winner page
13. Winners Gallery
14. Basic Admin Dashboard
15. Basic Audit Log
16. Device registration

## Version 2

-   Payment integration
-   Notifications
-   Owner verification
-   Advanced security
-   Reports
-   Better real-time updates

## Version 3

-   Native/advanced mobile app
-   Analytics
-   Advanced fraud detection
-   Improved real-time features

------------------------------------------------------------------------

# 22. User Journey

``` text
Register
   ↓
Choose Language
   ↓
Login
   ↓
Home
   ↓
Choose Auction
   ↓
View Product
   ↓
View Rules
   ↓
Pay/activate bid service if applicable
   ↓
Submit Bid
   ↓
Receive Confirmation
   ↓
Wait for Auction End
   ↓
Auction Closes
   ↓
Result Calculated
   ↓
Winner Published
```

------------------------------------------------------------------------

# 23. Main Business Rules

1.  A closed auction does not accept new bids.
2.  Invalid or unverified payments cannot activate a paid bid.
3.  The server validates every bid.
4.  The winner is determined by the defined Lowest Unique Bid rule.
5.  Results are recorded with an audit trail.
6.  Passwords are never stored in plain text.
7.  Sensitive personal information is not publicly exposed.
8.  Winner phone numbers are masked in the public Winners Gallery, for
    example `0917****47`.
9.  Admin permissions use role-based authorization.
10. Security-sensitive actions are logged.
11. Auction rules must be visible to participants before they submit a
    bid.
12. The language preference is stored per user/session.
13. English and Amharic UI text must come from localization files.
14. The system must use the same business rules regardless of selected
    language.

------------------------------------------------------------------------

# 24. UI / UX Direction

The supplied screenshots can be used as inspiration for the general user
experience, but the new app should have its own branding, visual
identity, and interface.

Key UI elements:

-   Clean product cards
-   Product images
-   Large countdown
-   Clear auction code
-   Bid amount control
-   Prominent action button
-   Winner cards
-   Search/filter
-   Mobile-first responsive layout
-   English/Amharic language switcher
-   Proper Amharic typography
-   Consistent navigation

------------------------------------------------------------------------

# 25. Development Roadmap

## Step 1 --- Requirements

Finalize:

-   Auction rules
-   Bid rules
-   User roles
-   Owner rules
-   Result rules
-   Language requirements
-   Payment requirements
-   Compliance requirements

## Step 2 --- Database Design

Create:

-   Users
-   Devices
-   Products
-   Auctions
-   Bids
-   Payments
-   Winners
-   Audit Logs

## Step 3 --- Backend API

Build the FastAPI backend.

## Step 4 --- Authentication

Build:

-   Registration
-   Login
-   Sessions/tokens
-   Role authorization
-   Device verification

## Step 5 --- Auction Management

Build:

-   Create auction
-   Publish auction
-   Start auction
-   Close auction
-   Auction status

## Step 6 --- Bid System

Build:

-   Submit bid
-   Validate bid
-   Store bid
-   Bid history
-   Bid limits

## Step 7 --- Lowest Unique Bid Algorithm

Implement and test the winner calculation with many edge cases.

## Step 8 --- Winner / Result System

Create:

-   Result calculation
-   Winner record
-   Result verification/reference
-   Winners Gallery

## Step 9 --- Frontend

Build:

-   Home
-   Auctions
-   Auction details
-   Profile
-   Winners
-   Admin screens

## Step 10 --- Localization

Add:

``` text
English
አማርኛ
```

and test every screen in both languages.

## Step 11 --- Admin Dashboard

Add management and monitoring tools.

## Step 12 --- Security Testing

Test:

-   Authentication
-   Authorization
-   Input validation
-   Rate limiting
-   Session security
-   Payment verification
-   Audit logs
-   Access control

## Step 13 --- Sandbox Testing

Run the entire system with test accounts and test payments only.

## Step 14 --- Compliance Review

Before real-money production use, verify all applicable licenses,
regulations, payment-provider requirements, consumer protections, tax
obligations, and other legal requirements.

## Step 15 --- Production Deployment

Deploy only after technical, security, and compliance checks are
complete.

------------------------------------------------------------------------

# 26. Complete System Flow

``` text
                    CHERTA PLATFORM
                          │
          ┌───────────────┼────────────────┐
          │               │                │
        USER           OWNER             ADMIN
          │               │                │
          ↓               ↓                ↓
       Register        Create Auction    Manage System
          │               │                │
          ↓               ↓                ↓
       Login          Add Product       Review Users
          │               │                │
          └───────┬───────┘                │
                  ↓                        │
             Browse Auction               │
                  ↓                        │
             View Details                 │
                  ↓                        │
              Submit Bid                  │
                  ↓                        │
          Payment/Entitlement             │
             Verification                 │
                  ↓                        │
             Valid Bid                     │
                  ↓                        │
            Auction Closes                │
                  ↓                        │
          Freeze Valid Bids               │
                  ↓                        │
        Count Bid Amounts                 │
                  ↓                        │
       Find Unique Amounts               │
                  ↓                        │
      Find Lowest Unique Bid             │
                  ↓                        │
             Winner                       │
                  ↓                        │
          Audit + Result                  │
                  ↓                        │
          Winners Gallery                 │
```

------------------------------------------------------------------------

# 27. Final Product Vision

The final Cherta platform should provide:

-   A clear auction marketplace
-   Separate User, Owner, and Admin roles
-   Lowest Unique Bid auction logic
-   Secure bid processing
-   Transparent result calculation
-   Winner history/gallery
-   Device and account security
-   Audit logging
-   English and Amharic language support
-   Mobile-first responsive design
-   Test/sandbox environment
-   Production-ready architecture after security and compliance review

The central concept is:

``` text
Product
   ↓
Auction
   ↓
Participants
   ↓
Bids
   ↓
Auction Closes
   ↓
Count Bids
   ↓
Lowest Unique Bid
   ↓
Winner
   ↓
Transparent Result
```

# 28. Initial Admin Account Configuration

The initial administrator account for development is:

```text
Username: micki-chereta
Password: [stored securely as an environment secret]
```

The password must **not** be hard-coded in the frontend, source code, Git repository, database seed files, or public documentation.

For local development, configure:

```env
ADMIN_USERNAME=micki-chereta
ADMIN_PASSWORD=<SET_YOUR_ADMIN_PASSWORD>
```

For production, use a protected environment variable or a secrets manager.

The backend must store only a strong password hash, never the plaintext password.

## Admin Login Flow

```text
Admin Login
    ↓
Username + Password
    ↓
Backend Authentication
    ↓
Password Hash Verification
    ↓
Admin Session Created
    ↓
Admin Dashboard
```

## Admin Security

- Two-factor authentication (2FA)
- Login attempt rate limiting
- Failed-login monitoring
- Secure session expiration
- Secure logout
- Admin audit logs
- New-device/login alerts
- Role-based authorization