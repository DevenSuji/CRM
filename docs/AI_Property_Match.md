I'm going to explain what and how the dynamic property matching needs to happen or work using Gemini 2.5 Pro Model.

Every lead card has a field called Property Interested In and right now either the property is getting tagged automatically by the lead generation system or we have the capabilty to add/tag multiple properties that match the lead's requirement.

Let's change the 'Property Interested In' field to a simple dropdown field that has the options ( Plotted Land, Villa, Apartment, Commercial Building, Commercial Land, Managed Farmland, Agricultural Land, Industrial Building, Industrial Land)

Let's add a new field called Matching Property. This is the field that Gemini/Script will automatically tag the matching properties for every lead based on what we have in the inventory. It needs to have the same tagging feature that 'Property Interested In' currently instested in. Apart from Gemini/Script everyone else also should have access to tag and untag the properties manually from the CRM/Lead Card.

Property Matching Logic.


1. When the lead is reach out by our sales associates, there are certain questions that we ask and update the lead card:
    a. What type of property is the client looking for (e.g. Plotted Land, Villa, Apartment, Commercial Building, Commercial Land, Managed Farmland, Agricultural Land, Industrial Building, Industrial Land). This is basically the 'Property Interested In' field which anyone can edit.
    b. Budget (Upper limit)
    c. Locality (We'll be entering multiple localities and this needs to be powered by google maps)
    d. Urgency
    e. WhatsApp Phone Number

2. Type of property and budget has the highest priority. Locality has the second highest priority. Urgency has the third highest priority.
3. Let's say we gather these details and save it in the CRM, there are two possibilities which are either we have the property in our inventory or we do not have the property in our inventory. 

If we have the matching property within the budget or +20% north of the budget. This is a match. Anything less than the budget or 20% more than the budget needs to get matched automatically and lead card should show up in the "Property Matched" Swimming Lane with relevant properties tagged in the field Matching Property for each lead card. 

What if we do not have the property?
Let's say after a week or a month or a year, we add a property from the project page that matches the Property Type and Budget for that matches x, y , z client's requirement. Let's say that the client had told us that he needs a Villa for Rs 8000000. And we have added a new villa  project that is Rs 10000000. This is 20% more than client budget. This is a match for me. Anything less than the budget or 20% more than the budget needs to get matched automatically and lead card should show up in the property matched Swimming Lane automatically with relevant properties tagged in the field Matching Property for each lead card.

By default anything less than the budget or +20% north of the budget needs to be a default match. 

This 20% Threshold needs to show up as a slider button on the top of leads page. It should be adjustable and should have option to increase the threshold to 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100 and so on. This is a very important feature and I want it to work, quickly, instantly and flawlessly.

I've already mentioned that Property Type and Budget is the primary factor when making a match. Locality should also have precedence but lower priority than Budget and Property Type. The property that matches the most in terms of proximity after Budget and Property Type match needs to be showing up at the top of the swimming lane with relevant properties tagged in the field Matching Property for each lead card.

You might have to use google maps or something that helps you understand the proximity of the property.

Let's add this feature.
Test it thoroughly.
Ensure it comes out clean and works eveytime.