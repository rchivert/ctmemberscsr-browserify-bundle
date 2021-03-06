﻿import * as $ from 'jquery'; 
import * as ko from "knockout";


namespace myCTMemberEditFormCSR 
{	

//  Add logged-In User stuff here  
//
class loggedInUser
{
static IsCTMember:boolean = false;	// determined from membership in CTMembers list  
static IsSiteOwner:boolean = false;	// determined from membership in Owners Group
 
static HarvestRoleValues (results1:any, results2:any)
	{
	//  process the group memberships 
	//
	let groupOwners = "Team Site Owners".toUpperCase();

	for (let i=0; i < results1.length; i++)
		{
		let currGroup = results1[i].Title.toUpperCase();
		if (currGroup === groupOwners) loggedInUser.IsSiteOwner = true;
		};

	//  process CTMember item
	//
	if (results2.length === 1)
		{
		loggedInUser.IsCTMember	= true ;   
		}	

	console.log ("loggedInUser.IsCTMember = " + loggedInUser.IsCTMember);
	}

static GetRoles () 
	{
	let deferred = $.Deferred();

	//  Get the groups the current user belongs to.
	//
	$.ajax({
			url: _spPageContextInfo.webAbsoluteUrl + "/_api/web/currentuser/Groups?$select=Title",
			method: "GET",
			headers: {"accept": "application/json;odata=verbose"},
			success: function (resultsData)
						{
						deferred.resolve(resultsData.d.results);
						},
			error:   function (jqXHR, textStatus, errorThrown)
						{
						window.console.log('error: loggedInUser.GetRoles returned an error');
						deferred.reject();
						}
			});

	return deferred.promise();
	}

static GetCTMemberValues ()
	{
	let deferred = $.Deferred();

	//  Get the prefix for current site SharePoint Groups (e.g. for "Ray Members", the prefix is "Ray").   
	//
	let sREST = String.format("/_api/web/lists/GetByTitle('CTMembers')/items?$filter=CTMemberId+eq+{0}&$select=CTMemberId", _spPageContextInfo.userId);

	$.ajax({
			url: _spPageContextInfo.webAbsoluteUrl + sREST,
			method: "GET",
			headers: {"accept": "application/json;odata=verbose"},
			success: function (resultsData)
						{
						deferred.resolve(resultsData.d.results);
						},
			error:   function (jqXHR, textStatus, errorThrown)
						{
						window.console.log('error: loggedInUser.GetCTMemberValues returned an error');
						deferred.reject();
						}
			});

	return deferred.promise();
	}
}


class myCTMemberEditForm
{
static IsFormHidden : boolean = false;
static CTMemberNeedsDataRoomAccessID : string;
static CTMemberNeedsDataRoomAccess: string;
static IsLoggedInUserTheCTMember: boolean;
static CTMemberId : string;

static postProcessEditForm ()
	{
	// DOM variables
	let btnSave;
	let chkNeedsDataRoomAccess;

	//  Get Logged-In user's permissions
	//
	let promise1 = loggedInUser.GetRoles();
	let promise2 = loggedInUser.GetCTMemberValues();

	$.when (promise1, promise2).done(function(data1, data2)
		{
		//  Get the permissions of the logged-in user
		//    
		loggedInUser.HarvestRoleValues (data1, data2);

		//  re-label form labels
		//
		$( "nobr:contains('CTMemberNeedsDataRoomAccess')" ).text(function () {return $(this).text().replace("CTMemberNeedsDataRoomAccess", "")});
		$( "nobr:contains('CTMember')" ).text(function () {return $(this).text().replace("CTMember", "Clean Team Member")}); 

		// DOM controls
		//
		btnSave = $('input[type=button]').filter(function(){return $(this).prop('value') === "Save";}).filter(":last");
		chkNeedsDataRoomAccess			= $('#' + myCTMemberEditForm.CTMemberNeedsDataRoomAccessID);

		// remove the "Created at"" & "Last Modified" text
		$('#onetidinfoblock1').remove();
		$('#onetidinfoblock2').remove();

		//   Hide the ribbon
		//
		$('#s4-ribbonrow').hide();		
 
		//  Add additional labels
		// 
		chkNeedsDataRoomAccess.after("<nobr>&nbsp;Needs Data Room Access</nobr>");
		
		//  Knockout bindings   
		btnSave.attr( "data-bind", "enable: saveIsEnabled");  
		chkNeedsDataRoomAccess.attr	( "data-bind", "checked: komodelCTMemberNeedsDataRoomAccess, enable: chkDataRoomAccessIsEnabled");

		// utility function(s) used by model

		function IsLoggedInUserNormalMember()
			{
			let isNormal = (loggedInUser.IsCTMember && !loggedInUser.IsSiteOwner); 
			return isNormal;
			}
			
		//   Knockout view model
		function AppViewModel() 
			{
			let model = this;
			
			model.komodelCTMemberNeedsDataRoomAccess = ko.observable(myCTMemberEditForm.CTMemberNeedsDataRoomAccess == "1");

			model.saveIsEnabled = ko.computed(function() 
				{
				let isEnabled = false;

					if (IsLoggedInUserNormalMember() && !myCTMemberEditForm.IsLoggedInUserTheCTMember)
						{
						isEnabled = false; 	// Save is disabled if user is normal and trying to edit another member.
						}
					else
						{
						isEnabled = true;	
						}
					
				return isEnabled;
				});


			model.chkDataRoomAccessIsEnabled = ko.computed(function() 
				{
				//  logged-in user is allowed to edit their own data room access (even if they are not an owner)
				return ( myCTMemberEditForm.IsLoggedInUserTheCTMember || loggedInUser.IsSiteOwner ) ;
				});
			}; 
			
			ko.applyBindings(new AppViewModel());

			}  
	);  // $.when
	
	//  Now show the form
	$('body').show();	
	}

static OnPostRenderFunc (ctx:SPClientTemplates.RenderContext_Form) 
	{
	// This line hides all fields marked hidden
    $("#csrHiddenField").closest("tr").hide();

	console.log("OnPostRender FieldName = " +  ctx.ListSchema.Field[0].Name);
	let f = ctx.ListSchema.Field[0];
	let fieldName = ctx.ListSchema.Field[0].Name;

	if (!myCTMemberEditForm.IsFormHidden) 
		{
		myCTMemberEditForm.IsFormHidden = true;

		// hide all content until after we re-configure the Form
		//$('body').hide();
		}

	//  Extract the control IDs... need them for KnockOut bindings.
	//   (technique for getting ID: http://www.codeproject.com/Articles/610259/SharePoint-Client-Side-Rendering-List-Forms, and enhanced by adding two back slashes to _$ to avoid conflicts with jQuery)
	//   also...  must use 'Text' instead of 'Note' for FieldType (not sure why.. perhaps because not using rich text?)
	//            must use 'DropDownChoice' instead of 'Choice', and there are "choice" radio button variations
	switch (fieldName)
		{
		case "CTMemberNeedsDataRoomAccess": 	myCTMemberEditForm.CTMemberNeedsDataRoomAccessID 	= f.Name + "_" + f.Id + "_\\$" + "BooleanField"; 		break;
		case "Attachments":
		 			{	
					// this is the last field on the Edit form... so use this like a jQuery OnLoad event			
					//   Initialize values 	
					myCTMemberEditForm.CTMemberNeedsDataRoomAccess	= ctx.ListData.Items[0].CTMemberNeedsDataRoomAccess;  	// e.g. "0"
					myCTMemberEditForm.CTMemberId					= ctx.ListData.Items[0].CTMember[0].EntityData.SPUserID;// e.g. "19"
					
					//  Is logged-in user editing their own item?
					//	
					//   note:  using "==" instead of "===" to get automatic type conversion of string to number
					//
					myCTMemberEditForm.IsLoggedInUserTheCTMember = (myCTMemberEditForm.CTMemberId == _spPageContextInfo.userId.toString());

					myCTMemberEditForm.postProcessEditForm();	
					}
					break;
		default: 	break;
		}
	}

static hiddenFieldTemplate (ctx: SPClientTemplates.RenderContext_FieldInForm): string
	{
	return "<span class='csrHiddenField'></span>";	
	}

static readOnlyFieldTemplate (ctx: SPClientTemplates.RenderContext_FieldInForm) : string
	{
	let formCtx = SPClientTemplates.Utility.GetFormContextForCurrentField(ctx) ;
	return formCtx.fieldValue[0].DisplayText;
	}
}

	
		

debugger;
let overrideCtx : SPClientTemplates.TemplateOverridesOptions = {};
overrideCtx.Templates = {};	

// mark fields to be read-only or hidden (which will be hidden by the OnPostRender function)
overrideCtx.Templates.Fields = {
  		"CTMember": {
            		"EditForm": myCTMemberEditForm.readOnlyFieldTemplate
        			}
    };
overrideCtx.OnPostRender = myCTMemberEditForm.OnPostRenderFunc;
SPClientTemplates.TemplateManager.RegisterTemplateOverrides(overrideCtx);

} // namespace

//   Validate form before allowing save.  Note: it's important to place this function outside of the IIF above, else SharePoint won't call it.
//
//  function PreSaveAction()
//
function PreSaveAction()
	{
	let formIsValid = true;  // innocent until proven guilt
	return formIsValid;	
	}
