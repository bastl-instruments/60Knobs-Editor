const numbKnobs = 60;

let $ = require('jquery');
var ipcRenderer = require('electron').ipcRenderer;
const {dialog} = require('electron').remote;
const loadJsonFile = require('load-json-file');
const jetpack = require('fs-jetpack');


var currentPreset = null;
var currentFilename = null;

$(function(){

	createUI();

	currentPreset = getLXRPreset();
	updateUIFromPreset();

	ipcRenderer.on('midi_port_options', function (event,message) {
			setMIDIPortOptions(message);
	});
	ipcRenderer.send('request_midi_port_options','');


	// Subscribe to events
	$("#write button").on("click", sendMIDI);
	$("button#loadSettings").on("click", loadSettingsFromFile);
	$("button#storeSettings").on("click", storeSettingsToFile);

	$(document).on("change", "#knob-container select.type", function(e) {
		adaptKnobSettings($(e.target).parent(), true);
		limitInputFieldsToRange();
	});

	$(document).on("change", "#knob-container tr:nth-of-type(1) input", function(e) {
		adaptKnobSettings($(e.target).parent().parent().parent().parent().parent(), false);
		limitInputFieldsToRange();
	});

});

/* ***********
 * SAVE & LOAD
**************/

function loadSettingsFromFile() {
	  var presetFilePath = dialog.showOpenDialog({
			title: "Open Preset",
			defaultPath: ".",
			buttonLabel: "Load Preset"
		});
		if (presetFilePath) {
			try {
				var data = loadJsonFile.sync(presetFilePath[0]);
				currentPreset = data;
				currentFilename = presetFilePath[0];
				updateUIFromPreset();
				showFileOperationStatus("Loaded Preset File");
			}
			catch(err) {
				showFileOperationStatus("Could not load " + presetFilePath[0], {error: true});
				console.log(err);
				currentPreset = null;
				currentFilename = null;
			}
		}
}

function storeSettingsToFile() {
	  var presetFilePath = dialog.showSaveDialog({
			title: "Save Preset",
			defaultPath: currentFilename,
			buttonLabel: "Save Preset"
		});
		if (presetFilePath) {
			updatePresetFromUI();
			try {
				jetpack.write(presetFilePath, JSON.stringify(currentPreset, undefined, 4));
				showFileOperationStatus("Saved Preset to File");
			}
			catch(err) {
				showFileOperationStatus("Could not save");
			}
		}
}

/*******
 * MIDI
 *******/

function setMIDIPortOptions(portOptions) {
	var portSelect = $("#portselect select");
	portSelect.html("");
	for (var i=0; i<portOptions.length; i++){
		var el = $("<option></<option>");
		el.text(portOptions[i]);
		el.val(i);
		portSelect.append(el);
	}
}

function sendMIDI() {

	updatePresetFromUI();
	var messages = generateSysExFromPreset();
	var sysExStream = messagePayloadToSysEx(messages);

	showSendStatus("Sending..", {persistent: true});

	setTimeout(function() {
		// send port number and midi data to main process
		ipcRenderer.send('send_midi_data', {
				port: $("#portselect select")[0].value,
				data: sysExStream
		});
		ipcRenderer.once('send_midi_data', function(event, message) {
			if (message.result) {
				showSendStatus("Data sent");
			} else {
				showSendStatus("Error: " + message.message, true);
			}
		});
	}, 500);
}

 function messagePayloadToSysEx(messages) {
	 var sysExStream = [];
	 $.each(messages, function(mkey, mvalue) {
		 var thisMessage = [];
		 // SysEx Start
		 thisMessage.push(240);
		 // Manufacturer ID
		 thisMessage.push(48);
		 // Payload
		 $.each(mvalue, function(bkey, bvalue) {
			 bvalue = parseInt(bvalue);
			 if (bvalue < 127) {
				 thisMessage.push(bvalue);
			 } else {
				 console.log("Value out of range");
			 }
		 });
		 // SysEx Stop
		 thisMessage.push(247);
		 sysExStream.push(thisMessage);
	 });
	 return sysExStream;
 }


/* *************
 * PRESET -> UI
****************/

function updateUIFromPreset() {
	if (currentPreset) {

		$.each($("#knob-container>div"), function(key, value) {
			var thisKnobSettings = currentPreset.knobs[parseInt(key)];
			updateKnobFromPreset($(value), thisKnobSettings);
		});

		$("#globalsettings tr:first-of-type input")[0].value = currentPreset.channel;
		$("#globalsettings tr:nth-of-type(2) input")[0].checked = currentPreset.dropNRPNMSB;
		$("#send tr:nth-of-type(2) select")[0].value = currentPreset.presetID;
	}
}

function updateKnobFromPreset(UIElement, settings) {
	var typeField = UIElement.find("select.type")[0];
	var fieldOne = UIElement.find("tr:nth-of-type(1) input")[0];
	var fieldTwo = UIElement.find("tr:nth-of-type(2) input")[0];
	var checkbox = UIElement.find("tr:nth-of-type(3) input")[0];

	typeField.value = settings.type;
	fieldOne.value = settings.valOne;
	fieldTwo.value = settings.valTwo;
	checkbox.checked = settings.inverted;

	adaptKnobSettings(UIElement, false);
}


/* *************
 * UI -> PRESET
****************/

function updatePresetFromUI() {
	currentPreset = {knobs: []};

	$.each($("#knob-container>div"), function(key, value) {
		currentPreset.knobs.push(updatePresetFromKnob($(value)));
	});

	currentPreset.channel = $("#globalsettings tr:first-of-type input")[0].value;
	currentPreset.dropNRPNMSB = $("#globalsettings tr:nth-of-type(2) input")[0].checked;
	currentPreset.presetID = $("#send tr:nth-of-type(2) select")[0].value;

}

function updatePresetFromKnob(UIElement) {
	var typeField = UIElement.find("select.type")[0];
	var fieldOne = UIElement.find("tr:nth-of-type(1) input")[0];
	var fieldTwo = UIElement.find("tr:nth-of-type(2) input")[0];
	var checkbox = UIElement.find("tr:nth-of-type(3) input")[0];

	return {
		type: typeField.value,
		valOne: fieldOne.value,
		valTwo: fieldTwo.value,
		inverted: checkbox.checked
	};
}

/* ***************
 * PRESET -> SYSEX
******************/

function generateSysExFromPreset() {
	var messages = [];

	$.each(currentPreset.knobs, function(key, value) {
		var id = key;
		var type = value.type;
		var valOne = value.valOne;
		var valTwo = value.valTwo;
		var valCheck = value.inverted;

		var knobMessage = [type, id];

		switch (type) {
		// CC
		case "1":
			knobMessage.push(valOne);
			knobMessage.push(0);
			break;
		// NPRN bipolar and unipolar
		case "2":
		case "3":
			knobMessage.push(LSHB(valOne));
			knobMessage.push(MSHB(valOne));
			knobMessage.push(valTwo);
			break;
		// DX7
		case "4":
			knobMessage.push(MSHB(valOne));
			knobMessage.push(LSHB(valOne));
			knobMessage.push(valTwo);
			break;
		// CC on separate channel
		case "15":
			knobMessage.push(valOne);
			knobMessage.push(valTwo);
			break;
		// disabled
		case "16":
			break;
		// NPRN exponent
		case "18":
			knobMessage.push(LSHB(valOne));
			knobMessage.push(MSHB(valOne));
			knobMessage.push(valTwo);
		}

		var invertMessage = [17, id];
		if (valCheck) {
			invertMessage.push(1);
		} else {
			invertMessage.push(0);
		}

		messages.push(knobMessage);
		messages.push(invertMessage);
	});

	messages.push([9, currentPreset.channel]);

	if (currentPreset.dropNRPNMSB) {
		messages.push([19, 1]);
	} else {
		messages.push([19, 0]);
	}

	messages.push([5, currentPreset.presetID]);



	return messages;
}

/***********************
 * MODIFY USER INTERFACE
 ***********************/

function createUI() {
	var knobContainer = $("#knob-container");
	var singleKnob = knobContainer.find("div:first-of-type");
	for (var i=1; i<numbKnobs; i++) {
		var thisKnob = singleKnob.clone();
		thisKnob.find("header").text((i+1).toString());
		knobContainer.append(thisKnob);
	}
}
/*
 * Adapt the form fields for a single knob depending on
 * the type that is set for this knob
 * Knob is passed as jquery reference to dom
*/
function adaptKnobSettings(knob, resetFieldValues) {

	// Get form fields for this knob
	var newType = knob.find("select.type")[0].value;
	var fieldOne = knob.find("tr:nth-of-type(1)");
	var fieldTwo = knob.find("tr:nth-of-type(2)");
	var checkbox = knob.find("tr:nth-of-type(3)");

	switch (newType) {
  // CC Type
	case "1":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 127);
		if (resetFieldValues) fieldOne.find('input').val(0);
		fieldTwo.hide();
		checkbox.show();
		break;
	// NPRN biploar
	case "2":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 16383);
		if (resetFieldValues) fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 63);
		if (resetFieldValues) fieldTwo.find('input').val(63);
		checkbox.show();
		break;
	// NPRN unipolar
	case "3":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 16383);
		if (resetFieldValues) fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 127);
		if (resetFieldValues) fieldTwo.find('input').val(127);
		checkbox.show();
		break;
	// DX7
	case "4":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 1);
		fieldOne.find('input').attr("max", 145);
		if (resetFieldValues) fieldOne.find('input').val(1);
		fieldTwo.show().find('label').text("Range");
		var DX7range = getDX7Range(fieldOne.find('input').val());
		fieldTwo.find('input').attr("min", DX7range[0]);
		fieldTwo.find('input').attr("max", DX7range[1]);
		if (resetFieldValues) fieldTwo.find('input').val(DX7range[1]);
		checkbox.show();
		break;
	// CC on separate channel
	case "15":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 127);
		if (resetFieldValues) fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Channel");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 16);
		if (resetFieldValues) fieldTwo.find('input').val(1);
		checkbox.show();
		break;
	// disabled
	case "16":
		fieldOne.hide();
		fieldTwo.hide();
		checkbox.hide();
		break;
	// NPRN exponent
	case "18":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 16383);
		if (resetFieldValues) fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 4);
		if (resetFieldValues) fieldTwo.find('input').val(1);
		checkbox.show();
		break;
	}
}

function getDX7Range(index) {

	index = Number(index);

	if ($.inArray(index,Array(
		1,2,3,4,5,6,7,8,9,10,11,
		17,20,
		22,23,24,25,26,27,28,29,30,31,32,
		38,41,
		43,44,45,46,47,48,49,50,51,52,53,
		59,62,
		64,65,66,67,68,69,70,71,72,73,74,
		80,83,
		85,86,87,88,89,90,91,92,93,94,95,
		101,104,
		106,107,108,109,110,111,112,113,114,115,116,
		122,125,
		127,178,129,130,131,132,133,134,
		148,138,140,141
	)) != -1) return Array(0,99);

	if ($.inArray(index,Array(
		12,13,15,
		33,34,36,
		54,55,57,
		75,76,78,
		96,97,99,
		117,118,120
	)) != -1) return [0,3];

	if ($.inArray(index,Array(
		14,16,
		35,37,
		56,58,
		77,79,
		98,100,
		119,121,
		136,
		144
	)) != -1) return [0,7];

	if ($.inArray(index,Array(
		18,39,60,81,102,123,137,142
	)) != -1) return [0,1];

	if ($.inArray(index,Array(
		19,40,61,82,103,124,135
	)) != -1) return [0,31];

	if ($.inArray(index,Array(
		21,42,63,84,105,126
	)) != -1) return [0,14];

	if ($.inArray(index,Array(
		143,
	)) != -1) return [0,4];

	if ($.inArray(index,Array(
		145,
	)) != -1) return [0,48];

	console.log("Could not find DX7 range for index", index);
}

/********
 * HELPER
 ********/

function getCleanPreset() {
	var thisPreset = {
		channel: 1,
		dropNRPNMSB: false,
		presetID: 0,
		knobs: []
	};

	for (var i=0; i<numbKnobs; i++) {
		thisPreset.knobs.push({
			type: 1,
			valOne: i,
			valTwo: 0,
			inverted: false,
		});
	}
	return thisPreset;
}

function getLXRPreset() {

	return {
		channel: 1,
		dropNRPNMSB: true,
		presetID: 0,
		knobs: [
		/*01*/ {type:1, valOne: 84, valTwo:0, inverted: false},
		/*02*/ {type:1, valOne: 83, valTwo:0, inverted: false},
		/*03*/ {type:1, valOne: 51, valTwo:0, inverted: false},
		/*04*/ {type:1, valOne: 75, valTwo:0, inverted: false},
		/*05*/ {type:1, valOne: 71, valTwo:0, inverted: false},
		/*06*/ {type:1, valOne: 103, valTwo:0, inverted: false},
		/*07*/ {type:1, valOne: 109, valTwo:0, inverted: false},
		/*08*/ {type:1, valOne: 89, valTwo:0, inverted: false},
		/*09*/ {type:3, valOne: 51*128, valTwo:11, inverted: false},
		/*10*/ {type:1, valOne: 122, valTwo:0, inverted: false},
		/*11*/ {type:1, valOne: 86, valTwo:0, inverted: false},
		/*12*/ {type:1, valOne: 85, valTwo:0, inverted: false},
		/*13*/ {type:1, valOne: 53, valTwo:0, inverted: false},
		/*14*/ {type:1, valOne: 76, valTwo:0, inverted: false},
		/*15*/ {type:1, valOne: 39, valTwo:0, inverted: false},
		/*16*/ {type:1, valOne: 45, valTwo:0, inverted: false},
		/*17*/ {type:1, valOne: 110, valTwo:0, inverted: false},
		/*18*/ {type:1, valOne: 90, valTwo:0, inverted: false},
		/*19*/ {type:3, valOne: 52*128, valTwo:11, inverted: false},
		/*20*/ {type:1, valOne: 123, valTwo:0, inverted: false},
		/*21*/ {type:1, valOne: 13, valTwo:0, inverted: false},
		/*22*/ {type:1, valOne: 87, valTwo:0, inverted: false},
		/*23*/ {type:1, valOne: 55, valTwo:0, inverted: false},
		/*24*/ {type:1, valOne: 77, valTwo:0, inverted: false},
		/*25*/ {type:1, valOne: 40, valTwo:0, inverted: false},
		/*26*/ {type:1, valOne: 46, valTwo:0, inverted: false},
		/*27*/ {type:1, valOne: 111, valTwo:0, inverted: false},
		/*28*/ {type:1, valOne: 91, valTwo:0, inverted: false},
		/*29*/ {type:3, valOne: 53*128, valTwo:11, inverted: false},
		/*30*/ {type:1, valOne: 124, valTwo:0, inverted: false},
		/*31*/ {type:1, valOne: 15, valTwo:0, inverted: false},
		/*32*/ {type:1, valOne: 29, valTwo:0, inverted: false},
		/*33*/ {type:1, valOne: 57, valTwo:0, inverted: false},
		/*34*/ {type:1, valOne: 78, valTwo:0, inverted: false},
		/*35*/ {type:1, valOne: 41, valTwo:0, inverted: false},
		/*36*/ {type:1, valOne: 47, valTwo:0, inverted: false},
		/*37*/ {type:1, valOne: 112, valTwo:0, inverted: false},
		/*38*/ {type:1, valOne: 92, valTwo:0, inverted: false},
		/*39*/ {type:3, valOne: 54*128, valTwo:11, inverted: false},
		/*40*/ {type:1, valOne: 125, valTwo:0, inverted: false},
		/*41*/ {type:1, valOne: 17, valTwo:0, inverted: false},
		/*42*/ {type:1, valOne: 58, valTwo:0, inverted: false},
		/*43*/ {type:1, valOne: 59, valTwo:0, inverted: false},
		/*44*/ {type:1, valOne: 67, valTwo:0, inverted: false},
		/*45*/ {type:1, valOne: 42, valTwo:0, inverted: false},
		/*46*/ {type:1, valOne: 48, valTwo:0, inverted: false},
		/*47*/ {type:1, valOne: 113, valTwo:0, inverted: false},
		/*48*/ {type:1, valOne: 93, valTwo:0, inverted: false},
		/*49*/ {type:3, valOne: 55*128, valTwo:11, inverted: false},
		/*50*/ {type:1, valOne: 126, valTwo:0, inverted: false},
		/*51*/ {type:1, valOne: 19, valTwo:0, inverted: false},
		/*52*/ {type:1, valOne: 61, valTwo:0, inverted: false},
		/*53*/ {type:1, valOne: 62, valTwo:0, inverted: false},
		/*54*/ {type:1, valOne: 68, valTwo:0, inverted: false},
		/*55*/ {type:1, valOne: 43, valTwo:0, inverted: false},
		/*56*/ {type:1, valOne: 49, valTwo:0, inverted: false},
		/*57*/ {type:1, valOne: 114, valTwo:0, inverted: false},
		/*58*/ {type:1, valOne: 94, valTwo:0, inverted: false},
		/*59*/ {type:3, valOne: 56*128, valTwo:11, inverted: false},
		/*60*/ {type:1, valOne: 127, valTwo:0, inverted: false},
	]};
}

function limitInputFieldsToRange() {
	$.each($("input"), function(key, element) {
		var element = $(element);
		var value = parseInt($(element).val());
		var min = $(element).prop('min');
		var max = $(element).prop('max');

		if (max && value > max) $(element).val(max);
		if (min && value < min) $(element).val(min);
	});
}

function showSendStatus(status, options) {
	var element = $("#write .result");
	updateResult(element, status, options||{});
}

function showFileOperationStatus(status, options) {
	var element = $("#loadsafe .result");
	updateResult(element, status, options||{});
}

function updateResult(element, status, options) {
	element.text(status);
	element.fadeIn(100, 'linear');
	if (options.error) {
		element.addClass("error");
		if (!options.persistent) element.fadeOut(5000, 'swing');
	} else {
		element.removeClass("error");
		if (!options.persistent) element.fadeOut(3000, 'swing');
	}
}

function MSHB(val) {
	return Math.floor(val/128);
}
function LSHB(val) {
	return val % 128;
}
