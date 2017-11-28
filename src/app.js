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

	currentPreset = getCleanPreset();
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
				showFileOperationStatus("Loaded Preset File", false);
			}
			catch(err) {
				showFileOperationStatus("Could not load " + presetFilePath[0], true);
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
				showFileOperationStatus("Saved Preset to File", false);
			}
			catch(err) {
				showFileOperationStatus("Could not save", false);
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
	messages.push([5, currentPreset.presetID]);

	if (currentPreset.dropNRPNMSB) {
		messages.push([19, 1]);
	} else {
		messages.push([19, 0]);
	}

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
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 144);
		if (resetFieldValues) fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 99);
		if (resetFieldValues) fieldTwo.find('input').val(9);
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

/********
 * HELPER
 ********/

function getCleanPreset() {
	var thisPreset = {
		channel: 1,
		dropNRPNMSB: false,
		presetID: 1,
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

function showSendStatus(status, error) {
	var element = $("#write .result");
	updateResult(element, status, error);
}

function showFileOperationStatus(status, error) {
	var element = $("#loadsafe .result");
	updateResult(element, status, error);
}

function updateResult(element, status, error) {
	element.text(status);
	element.fadeIn(100, 'linear');
	if (error) {
		element.addClass("error");
		element.fadeOut(5000, 'swing');
	} else {
		element.removeClass("error");
		element.fadeOut(3000, 'swing');
	}
}

function MSHB(val) {
	return Math.floor(val/128);
}
function LSHB(val) {
	return val % 128;
}
