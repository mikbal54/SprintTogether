import React, { useState } from "react";
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	TextField,
	MenuItem,
	FormControl,
	InputLabel,
	Select,
	FormHelperText,
	Snackbar,
	Alert
} from "@mui/material";
import { Formik, Form, Field } from "formik";
import type { FormikErrors } from "formik";
import { z } from "zod";
import { Status } from "../../types";
import { useWebSocket } from "../../contexts/WebSocketContext";

// Zod schema
const TaskSchema = z.object({
	subject: z.string().min(1, "Subject is required"),
	status: z.nativeEnum(Status),
	estimatedHours: z.number().min(1, "Must be at least 1 hour"),
	description: z.string().min(1, "Description is required")
});

type TaskForm = z.infer<typeof TaskSchema>;

interface TaskCreationModalProps {
	open: boolean;
	onClose: () => void;
	selectedSprintId?: string;
	selectedParentTaskId?: string;
	selectedParentTaskName?: string;
}

const TaskCreationModal: React.FC<TaskCreationModalProps> = ({ open, onClose, selectedSprintId, selectedParentTaskId, selectedParentTaskName }) => {
	const [editorValue, setEditorValue] = useState("");
	const [apiError, setApiError] = useState<string | null>(null);
	const [formKey, setFormKey] = useState<number>(0);
	const { emit } = useWebSocket();

	const handleClose = () => {
		setEditorValue("");
		setApiError(null);
		setFormKey((k) => k + 1);
		onClose();
	};

	// Zod validation for Formik
	const validate = (values: TaskForm) => {
		const errors: FormikErrors<TaskForm> = {};
		const result = TaskSchema.safeParse(values);
		if (!result.success) {
			for (const issue of result.error.issues) {
				const path = issue.path[0] as keyof TaskForm;
				errors[path] = issue.message as any;
			}
		}
		return errors;
	};

	const handleSubmit = async (values: TaskForm, { resetForm }: any) => {
		try {
			const payload = {
				title: values.subject,
				description: values.description,
				hours: values.estimatedHours,
				sprintId: selectedSprintId,
				parentId: selectedParentTaskId || undefined
			};
			
			
			
			// Send task:create event to server via WebSocket
			emit('task:create', payload);
			
			resetForm();
			setEditorValue("");
			setApiError(null);
			onClose();
		} catch (err: any) {
			console.error("WebSocket error:", err);
			setApiError("Failed to create task");
		}
	};

	return (
		<>
			<Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
				<DialogTitle>
					{selectedParentTaskId ? `Create Child Task (Parent: ${selectedParentTaskName})` : 'Create Task'}
				</DialogTitle>
				<Formik<TaskForm>
					key={formKey}
					initialValues={{
						subject: "",
						status: Status.OPEN,
						estimatedHours: 1,
						description: ""
					}}
					validate={validate}
					onSubmit={handleSubmit}
				>
					{({ errors, touched, values, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								{/* Subject */}
								<Field
									as={TextField}
									label="Subject"
									name="subject"
									fullWidth
									margin="normal"
									error={touched.subject && Boolean(errors.subject)}
									helperText={touched.subject && errors.subject}
								/>

								{/* Status */}
								<FormControl fullWidth margin="normal" error={touched.status && Boolean(errors.status)}>
									<InputLabel>Status</InputLabel>
									<Field
										as={Select}
										name="status"
										label="Status"
										value={values.status}
										onChange={(e: React.ChangeEvent<{ value: unknown }>) =>
											setFieldValue("status", e.target.value)
										}
									>
										<MenuItem value={Status.OPEN}>Open</MenuItem>
										<MenuItem value={Status.IN_PROGRESS}>In Progress</MenuItem>
										<MenuItem value={Status.COMPLETED}>Completed</MenuItem>
									</Field>
									<FormHelperText>{touched.status && errors.status}</FormHelperText>
								</FormControl>

								{/* Estimated Hours */}
								<Field
									as={TextField}
									label="Estimated Hours"
									name="estimatedHours"
									fullWidth
									margin="normal"
									type="number"
									error={touched.estimatedHours && Boolean(errors.estimatedHours)}
									helperText={touched.estimatedHours && errors.estimatedHours}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
										setFieldValue("estimatedHours", Number(e.target.value))
									}
								/>

								{/* Description */}
								<Field
									as={TextField}
									label="Description"
									name="description"
									fullWidth
									margin="normal"
									multiline
									minRows={4}
									value={editorValue}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
										setEditorValue(e.target.value);
										setFieldValue("description", e.target.value);
									}}
									error={touched.description && Boolean(errors.description)}
									helperText={touched.description && errors.description}
								/>
							</DialogContent>

							<DialogActions>
								<Button onClick={handleClose} color="secondary">
									Cancel
								</Button>
								<Button type="submit" variant="contained" color="primary">
									Create
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>
			</Dialog>

			{/* Floating error Snackbar */}
			<Snackbar
				open={Boolean(apiError)}
				autoHideDuration={6000}
				onClose={() => setApiError(null)}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert onClose={() => setApiError(null)} severity="error" sx={{ width: "100%" }}>
					{apiError}
				</Alert>
			</Snackbar>
		</>
	);
};

export default TaskCreationModal;
