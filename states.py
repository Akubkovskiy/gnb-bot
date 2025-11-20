from aiogram.fsm.state import State, StatesGroup

class ProjectStates(StatesGroup):
    waiting_for_name = State()
    uploading_files = State()
    verifying_data = State()
    generating_docs = State()
