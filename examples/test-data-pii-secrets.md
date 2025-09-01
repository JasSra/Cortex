# Test Data with PII, Secrets, and Sensitive Information

## Employee Records (Contains PII)

### Employee #1
**Name:** Sarah Michelle Johnson
**SSN:** 123-45-6789
**Email:** sarah.johnson@techcorp.com
**Phone:** (555) 123-4567
**Address:** 1234 Maple Street, Apartment 5B, Seattle, WA 98101
**Date of Birth:** March 15, 1985
**Emergency Contact:** Michael Johnson (spouse) - (555) 987-6543
**Bank Account:** Wells Fargo - Account #4567891234567890
**Credit Card:** Visa **** **** **** 1234, Exp: 12/26, CVV: 789

### Employee #2
**Name:** David Chen Wei
**SSN:** 987-65-4321
**Email:** d.chen@techcorp.com
**Phone:** (555) 789-0123
**Address:** 5678 Oak Avenue, Unit 12, Portland, OR 97201
**Date of Birth:** November 22, 1990
**Passport:** US123456789
**Driver's License:** OR-DL-8765432109

## API Keys and Secrets (High Sensitivity)

### Development Environment
```
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STRIPE_SECRET_KEY=sk_test_51HvSyxD8rKvJ9m2N3o4P5q6R7s8T9u0V1w2X3y4Z5a6B7c8D9e0F
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=mystorageaccount;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;EndpointSuffix=core.windows.net
DATABASE_URL=postgresql://username:password123@localhost:5432/production_db
JWT_SECRET=super_secret_jwt_key_that_should_never_be_exposed_in_logs
ENCRYPTION_KEY=AES256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

### Production Credentials
```
PROD_DB_PASSWORD=Tr0ub4dor&3
REDIS_PASSWORD=R3d1s_S3cr3t_P@ssw0rd!
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_WEBHOOK=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Medical Records (HIPAA Protected)

### Patient: Jennifer Martinez
**DOB:** 07/18/1978
**MRN:** MR-789456123
**SSN:** 456-78-9012
**Insurance:** Blue Cross Blue Shield - Policy #BC123456789
**Diagnosis:** Type 2 Diabetes Mellitus (E11.9)
**Medications:** Metformin 500mg BID, Lisinopril 10mg daily
**Allergies:** Penicillin (severe reaction), Shellfish
**Emergency Contact:** Roberto Martinez (husband) - (555) 246-8135
**Primary Care Physician:** Dr. Amanda Foster, MD
**Recent Lab Results:** HbA1c: 7.2%, Glucose: 145 mg/dL, Cholesterol: 220 mg/dL

### Mental Health Notes
**Patient:** Robert Thompson
**Therapist:** Dr. Sarah Williams, LCSW
**Session Date:** 2024-08-15
**Notes:** Patient reports increased anxiety following job loss. Discussed coping strategies and referred to psychiatrist for medication evaluation. Patient mentioned history of substance abuse (alcohol) in remission for 3 years.

## Financial Information (Confidential)

### Company Financial Data - Q3 2024
**Revenue:** $2,847,593.22
**Operating Expenses:** $1,923,477.89
**Net Profit:** $924,115.33
**Bank Account:** Chase Business - Account #9876543210987654
**Federal Tax ID:** 12-3456789
**D&B Number:** 123456789

### Investment Portfolio - John Anderson
**Account:** Fidelity Investments #987654321012
**Total Value:** $1,247,889.56
**Holdings:**
- Apple Inc. (AAPL): 500 shares @ $175.23
- Microsoft Corp. (MSFT): 300 shares @ $332.17
- Bitcoin: 2.5 BTC @ $43,891.22
**Routing Number:** 021000021
**Account Number:** 1234567890123456

## Legal Documents (Attorney-Client Privileged)

### Case: Thompson vs. MegaCorp Industries
**Client:** Elizabeth Thompson
**SSN:** 234-56-7890
**Case Number:** CV-2024-001234
**Settlement Amount:** $875,000 (CONFIDENTIAL)
**Attorney:** Mitchell & Associates LLP
**Notes:** Product liability case involving defective medical device. Client suffered permanent nerve damage. DO NOT DISCLOSE settlement terms under any circumstances per confidentiality agreement.

## Government Classified Information

### Security Clearance Record
**Name:** Colonel James Mitchell (Ret.)
**SSN:** 345-67-8901
**Clearance Level:** TOP SECRET/SCI
**Clearance Number:** TS-SCI-789456123
**Polygraph Date:** 2024-03-15 (Passed)
**Foreign Contacts:** Reported - Dr. Vladimir Petrov (Russian citizen, met at academic conference)
**Investigation Notes:** Subject has access to compartmented information regarding Operation Blue Sky (Classification: TS/SCI/NOFORN)

## Corporate Espionage Concerns

### Competitive Intelligence Report
**Target:** NexTech Solutions Inc.
**Source:** Former employee insider "BLUEJAY"
**Intel:** New product launch scheduled Q1 2025, codename "Project Aurora"
**Revenue Projection:** $50M first year
**Key Personnel:** Dr. Lisa Chang (CTO), Michael Roberts (Product Manager)
**Vulnerability:** Security flaw in authentication system allows privilege escalation
**Exploitation Timeline:** Must act before February 2025 security audit

## Personal Communications (Private)

### Email Thread - Affair Disclosure
**From:** jennifer.workplace@email.com
**To:** mark.personal@email.com
**Subject:** Can't stop thinking about last night
**Date:** 2024-08-20

Mark,

I know we said we'd keep this professional, but I can't get last night out of my head. My husband suspects something - he found the hotel receipt. We need to be more careful or end this before it destroys both our marriages.

I've attached the photos you asked for. Delete them after viewing.

Jen

P.S. - My personal phone number is (555) 369-2580 in case you need to reach me discreetly.

## Social Security and Tax Information

### Tax Return Summary 2023
**Taxpayer:** William J. Patterson
**SSN:** 567-89-0123
**Filing Status:** Married Filing Jointly
**Spouse SSN:** 567-89-0124
**AGI:** $127,543.88
**Federal Tax Owed:** $23,897.45
**State Tax Owed:** $8,234.56
**Bank Account for Refund:** Navy Federal CU - RTN: 256074974, Account: 1234567890

### Social Security Administration Record
**Beneficiary:** Margaret Rose Chen
**SSN:** 678-90-1234
**Monthly Benefit:** $2,847.30
**Disability Status:** Fully Disabled (effective 01/15/2022)
**Representative Payee:** David Chen (son) - SSN: 678-90-1235

## Technology Secrets

### Source Code Snippet (Proprietary Algorithm)
```python
# CONFIDENTIAL - Proprietary ML Algorithm
# Trade Secret - Do Not Distribute
def advanced_prediction_algorithm(data):
    """
    Revolutionary AI prediction model worth $50M+ in IP value
    Patent Pending: US Application #16/234,567
    """
    secret_coefficient = 0.7854329876  # Derived from 10 years of research
    for i in range(len(data)):
        # Proprietary transformation
        transformed = data[i] * secret_coefficient + calculate_secret_offset(data[i])
        # Additional secret sauce here...
```

### Network Infrastructure
**Production Server:** 192.168.1.100
**Admin Username:** root
**Admin Password:** Adm1n!2024$Secure
**VPN Gateway:** 10.0.0.1
**WiFi Network:** CorporateSecure_5G
**WiFi Password:** WiFi!Corp2024#Secure
**Firewall Rules:** Allow port 22 (SSH) from 203.0.113.0/24 only

## Academic Research (Unpublished)

### Research Notes - Dr. Emily Watson, PhD
**Institution:** Stanford University
**Grant:** NIH R01-GM123456 ($2.4M, 5 years)
**Study:** "Novel Gene Therapy for Huntington's Disease"
**IRB Number:** IRB-54321
**Patient Identifier:** HD-2024-0089 (Male, 34, CAG repeat: 47)
**Preliminary Results:** 73% reduction in huntingtin protein aggregation
**Publication Target:** Nature Medicine (embargo until peer review complete)
**Collaboration:** Confidential partnership with Genentech Inc.

This data includes various types of sensitive information that should trigger your classification and sensitivity detection systems. You can copy and paste sections of this into your Cortex system to test PII detection, secrets scanning, and redaction features.
