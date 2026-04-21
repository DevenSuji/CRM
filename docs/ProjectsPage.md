## More conditions for the Property Match algo

When I changed the Match threshold to different value like 35%, 50% , 75% and 100%, the number of leads card still remained static in the Property Matched Swimming Lane. Which means it did not trigger the property match function.

Now why this is needed?
Let's say that the client says by budget is Rs 20000000 and I can stretch the budget to 40% of that. This is where I want to be able to change the Match % to 40% and see which properties gets auto tagged to the lead card.

When I scale down the Match to the default value of 20% the properties that do not qualify for the match should get auto untagged.

Actually I think the Match % should live inside each lead card as well. The moment I select Property Type, adjust the budget and change the Match % I want the matching properties to get tagged automatically.

We also left one of the property type. Individual House which has many variants, Simplex (Just ground floor house), Duplex (Ground and 1st Floor), Triplex (Ground, 1st and 2nd Floor) and Quadraplex (Ground, 1st,  2nd Floor and 3rd Floor). This Variant also has an attribute called BHK. 1 BHK means 1 Bedroom House, 2 BHK means 2 Bedrooms, 3 BHK means 3 Bedrooms, 4 BHK means 4 Bedrooms and so on. 

Hence the property matching algorithm should consider this field as well as this is a non negotialble factor.

The BHK factor should also be considered by Google Gemini when making match for Villa and Apartment and Individual House because a client looking for 3 bhk property will never compromise for 2 bhk property.



## Project Page.

1. I'm not able to click on the pictures that I've uploaded for each project and view it. It is not responsive. I want to be able to click on the picuture and view it as a large picture and it needs to have the scroll arrow to the left and right side of the zoomed picture for me to be able to view other pictures of the project.

## Internal Team Dashboard.

The Internal Team Dashboard needs to have three of it's most important stats shown as a viasually appealing and stunnigly animated graphs giving us a clear sight of the direction we are heading towards.

It also needs to have that historical comparison of daily/weekly/monthly/yearly sales that one can filter and view.

## Lead Card Pop Up Baloon Issue.
When I hover my mouse at the last Lead Card from the top in any swmiing lane, it does not show me the full baloon view. It shows up as truncated baloon. No matter where in the swimming lane is the Lead Card, when the mouse is hovered over it, the baoloon view should be full just like when we hover the mouse on the first lead card in a swimming lane.

## Swimming Lane Placement
The Property Matched Swimming Lane needs to be the third one and not the second one. The reason is when the sales associte calls the leads, the sales associate might change the budget, location , BHK preferences and other preferences. Once these adjustments have been made, that's when the property matching algo needs to kick in , read the atttributes and tag the properties automatically.

Once the property is tagged, one should also be able to hover the mouse over the property and view the property details as a scrollable pop up  baloon that shows all the details of the property. Once when click on the baloon, it should take the sales associate to the project page to the property that was clicked to be able to view the entire details of the property.

## Send Property Details

Once a property is automatically or manually tagged to a lead card, there is a button called Send Property Details.
Now this details are sent to the lead using whatsapp.
Hence Send Property Details should grab the pictures and every detail of the property and send it as a beautifully, neatly formatted whatsapp message.
Do we use a template for this or leave Gemini to do it?


******************* 18th April 2026 *******************


When a lead card is  placed in Site Booked Swimming Lane, there is a mandatory field missing called Booked Property where the Unit number of the property will be entered. This unit when entered here needs to be shown as booked everywhere else and to everyone in the CRM. If we do not get this right, a same property will show up as booked by multiple leads. You understand the repurcussion here right?

Spelling and Grammer correction assistance in Notes section is missing. Add it.

When I open the lead card, Matching Property has multiple properties tagged. When I hover my mouse over the tagged properties while the lead card is opened, I want the details of the property to pop up as a balloon. This pop up balloon needs to have all the necessary details of the property. I guess if the details are not fitting in the pop up balloon, make it scrollable.

Under Admin Console WhatsApp page has an issue. 

Message Templates
These must be pre-approved in your Meta Business Suite.

Site Visit Confirmation Template
site_visit_confirmation: This accepts only single line. What the hell are you doing here???
Site Visit Reminder Template
site_visit_reminder: This accepts only single line. What the hell are you doing here???

The page looks like a truncated page.

Reminder Schedule
Immediately on site visit confirmation: This shows up only half. 

Why are you overlooking these issues?

Is this CRM responsive?

Will this CRM work on an android phone or apple phone over the browser?

AIzaSyCQofj-RgOTeZFR4B8L2pft6nBtWVQQqsU

curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" \
  -H 'Content-Type: application/json' \
  -H 'X-goog-api-key: AIzaSyCQofj-RgOTeZFR4B8L2pft6nBtWVQQqsU' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'

I want more RBAC added.

SuperAdmin: root user. Will have access to everything.
Admin: 
Sales Executive:
HR:
Payroll:
Finance:
Digital Marketing:
Channel Partner: 

After the site visit a thank you message needs to be sent to the lead.

Spelling and Grammer correction assistance in Notes section

Source of lead (Channel Partners) is missing.

CP RBAC 

CP Get together


[browser] As of March 1st, 2025, google.maps.places.Autocomplete is not available to new customers. Please use google.maps.places.PlaceAutocompleteElement instead. At this time, google.maps.places.Autocomplete is not scheduled to be discontinued, but google.maps.places.PlaceAutocompleteElement is recommended over google.maps.places.Autocomplete. While google.maps.places.Autocomplete will continue to receive bug fixes for any major regressions, existing bugs in google.maps.places.Autocomplete will not be addressed. At least 12 months notice will be given before support is discontinued. Please see https://developers.google.com/maps/legacy for additional details and https://developers.google.com/maps/documentation/javascript/places-migration-overview for the migration guide. (file:///Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard/.next/dev/static/chunks/node_modules_next_dist_115brz8._.js:2431:13)

Need to work on the AI Property Match
